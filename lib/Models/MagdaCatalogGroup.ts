import { computed, makeObservable, runInAction } from "mobx";
import loadJson from "terriajs/lib/Core/loadJson";
import TerriaError from "terriajs/lib/Core/TerriaError";
import CatalogMemberMixin from "terriajs/lib/ModelMixins/CatalogMemberMixin";
import GroupMixin from "terriajs/lib/ModelMixins/GroupMixin";
import UrlMixin from "terriajs/lib/ModelMixins/UrlMixin";
import CommonStrata from "terriajs/lib/Models/Definition/CommonStrata";
import CreateModel from "terriajs/lib/Models/Definition/CreateModel";
import LoadableStratum from "terriajs/lib/Models/Definition/LoadableStratum";
import { BaseModel } from "terriajs/lib/Models/Definition/Model";
import StratumOrder from "terriajs/lib/Models/Definition/StratumOrder";
import updateModelFromJson from "terriajs/lib/Models/Definition/updateModelFromJson";
import Terria from "terriajs/lib/Models/Terria";
import ModelReference from "terriajs/lib/Traits/ModelReference";
import MagdaCatalogGroupTraits from "../Traits/MagdaCatalogGroupTraits";
import MagdaPreviewReference from "./MagdaPreviewReference";
import {
  buildRegistryRecordsListUrl,
  catalogContinuationId,
  catalogContinuationJson,
  catalogDatasetMemberId,
  catalogDatasetReferenceJson,
  MAGDA_CATALOG_GROUP_TYPE,
  MAGDA_CATALOG_ROOT_ID,
  MagdaCatalogSettings,
  parseRegistryRecordsPage
} from "./magdaCatalog";

/** Holds the member IDs of the one Registry page this group has loaded. */
class MagdaCatalogPageStratum extends LoadableStratum(MagdaCatalogGroupTraits) {
  static stratumName = "magdaCatalogPage";

  constructor(readonly memberIds: readonly string[]) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(_model: BaseModel): this {
    return new MagdaCatalogPageStratum(this.memberIds) as this;
  }

  @computed
  get members(): ModelReference[] {
    return [...this.memberIds];
  }
}

StratumOrder.addLoadStratum(MagdaCatalogPageStratum.stratumName);

/**
 * Lazily lists a Magda deployment's datasets, one bounded Registry page per
 * expansion. Discovery only: every child is an ordinary `magda-item`
 * (`MagdaPreviewReference`) that resolves and renders through the existing
 * compatibility path when the user adds it.
 */
export default class MagdaCatalogGroup extends UrlMixin(
  GroupMixin(CatalogMemberMixin(CreateModel(MagdaCatalogGroupTraits)))
) {
  static readonly type = MAGDA_CATALOG_GROUP_TYPE;

  get type(): string {
    return MagdaCatalogGroup.type;
  }

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference?: BaseModel
  ) {
    super(id, terria, sourceReference);
    makeObservable(this);
  }

  private get catalogRootId(): string {
    return this.rootCatalogId ?? this.uniqueId ?? MAGDA_CATALOG_ROOT_ID;
  }

  private get childSettings(): MagdaCatalogSettings {
    return {
      url: this.url,
      storageApiUrl: this.storageApiUrl,
      defaultBucket: this.defaultBucket,
      datasetBucket: this.datasetBucket
    };
  }

  protected async forceLoadMetadata(): Promise<void> {
    // Listing datasets is member loading; metadata needs no request.
  }

  protected async forceLoadMembers(): Promise<void> {
    const listUrl = buildRegistryRecordsListUrl({
      url: this.url,
      pageSize: this.pageSize,
      pageToken: this.pageToken
    });
    // Deliberately not proxied: the same-origin request carries the viewer's
    // Magda session, so the Registry decides which records are visible.
    let response: unknown;
    try {
      response = await loadJson(
        listUrl,
        this.terria.configParameters.magdaReferenceHeaders
      );
    } catch (error) {
      throw TerriaError.from(error, {
        title: "Magda catalog unavailable",
        message: "The Magda data catalog could not be loaded."
      });
    }
    const page = parseRegistryRecordsPage(response);

    runInAction(() => {
      const memberIds = page.records.map((record) =>
        this.createDatasetReference(record)
      );
      if (page.hasMore && page.nextPageToken) {
        memberIds.push(this.createContinuation(page.nextPageToken));
      }
      this.strata.set(
        MagdaCatalogPageStratum.stratumName,
        new MagdaCatalogPageStratum(memberIds)
      );
    });
  }

  private createDatasetReference(
    record: Parameters<typeof catalogDatasetReferenceJson>[0]
  ): string {
    const id = catalogDatasetMemberId(this.catalogRootId, record.id!);
    const reference = this.findOrCreateMember(
      id,
      MagdaPreviewReference,
      () => new MagdaPreviewReference(id, this.terria)
    );
    updateModelFromJson(
      reference,
      CommonStrata.definition,
      catalogDatasetReferenceJson(record, this.childSettings)
    ).logError();
    return id;
  }

  private createContinuation(pageToken: string): string {
    const id = catalogContinuationId(this.catalogRootId, pageToken);
    const group = this.findOrCreateMember(
      id,
      MagdaCatalogGroup,
      () => new MagdaCatalogGroup(id, this.terria)
    );
    updateModelFromJson(
      group,
      CommonStrata.definition,
      catalogContinuationJson(
        pageToken,
        this.catalogRootId,
        this.pageSize,
        this.childSettings
      )
    ).logError();
    return id;
  }

  private findOrCreateMember<T extends BaseModel>(
    id: string,
    ModelClass: abstract new (...args: never[]) => T,
    create: () => T
  ): T {
    const existing = this.terria.getModelById(BaseModel, id);
    let model: T;
    if (existing instanceof ModelClass) {
      model = existing;
    } else {
      if (existing) this.terria.removeModelReferences(existing);
      model = create();
      this.terria.addModel(model);
    }
    if (
      this.uniqueId !== undefined &&
      !model.knownContainerUniqueIds.includes(this.uniqueId)
    ) {
      model.knownContainerUniqueIds.push(this.uniqueId);
    }
    return model;
  }
}
