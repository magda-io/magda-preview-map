import { IReactionDisposer, makeObservable, reaction } from "mobx";
import loadJson from "terriajs/lib/Core/loadJson";
import runLater from "terriajs/lib/Core/runLater";
import TerriaError from "terriajs/lib/Core/TerriaError";
import GroupMixin from "terriajs/lib/ModelMixins/GroupMixin";
import ReferenceMixin from "terriajs/lib/ModelMixins/ReferenceMixin";
import UrlMixin from "terriajs/lib/ModelMixins/UrlMixin";
import ArcGisFeatureServerCatalogGroup from "terriajs/lib/Models/Catalog/Esri/ArcGisFeatureServerCatalogGroup";
import ArcGisFeatureServerCatalogItem from "terriajs/lib/Models/Catalog/Esri/ArcGisFeatureServerCatalogItem";
import WebFeatureServiceCatalogGroup from "terriajs/lib/Models/Catalog/Ows/WebFeatureServiceCatalogGroup";
import WebFeatureServiceCatalogItem from "terriajs/lib/Models/Catalog/Ows/WebFeatureServiceCatalogItem";
import WebMapServiceCatalogGroup from "terriajs/lib/Models/Catalog/Ows/WebMapServiceCatalogGroup";
import WebMapServiceCatalogItem from "terriajs/lib/Models/Catalog/Ows/WebMapServiceCatalogItem";
import CatalogMemberFactory from "terriajs/lib/Models/Catalog/CatalogMemberFactory";
import proxyCatalogItemUrl from "terriajs/lib/Models/Catalog/proxyCatalogItemUrl";
import CommonStrata from "terriajs/lib/Models/Definition/CommonStrata";
import CreateModel from "terriajs/lib/Models/Definition/CreateModel";
import { BaseModel } from "terriajs/lib/Models/Definition/Model";
import updateModelFromJson from "terriajs/lib/Models/Definition/updateModelFromJson";
import Terria from "terriajs/lib/Models/Terria";
import MagdaPreviewReferenceTraits from "../Traits/MagdaPreviewReferenceTraits";
import {
  buildRegistryRecordUrl,
  findCompatibleDefinition,
  isFeatureServerRoot,
  MagdaPreviewDefinition,
  MagdaPreviewRecord,
  WFS_DEFAULT_MAX_FEATURES
} from "./magdaPreviewCompatibility";

/**
 * Thin compatibility reference for the unchanged Magda web-client payload.
 * Registry resolution lives here; all data loading remains in native TerriaJS
 * catalog models.
 */
export default class MagdaPreviewReference extends UrlMixin(
  ReferenceMixin(CreateModel(MagdaPreviewReferenceTraits))
) {
  static readonly type = "magda-item";

  private readonly disposeEnableReaction: IReactionDisposer;

  get type(): string {
    return MagdaPreviewReference.type;
  }

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference?: BaseModel
  ) {
    super(id, terria, sourceReference);
    makeObservable(this);

    this.disposeEnableReaction = reaction(
      () => this.isEnabled,
      (isEnabled) => this.updateEnabledState(isEnabled)
    );

    // The model is constructed immediately before its JSON stratum is applied.
    // Re-check on the next microtask so an initial `isEnabled: true` cannot be
    // missed by consumers that batch model construction and trait updates.
    Promise.resolve().then(() => this.updateEnabledState(this.isEnabled));
  }

  protected async forceLoadReference(
    previousTarget: BaseModel | undefined
  ): Promise<BaseModel | undefined> {
    const properties = {
      url: this.url,
      storageApiUrl: this.storageApiUrl,
      distributionId: this.distributionId,
      datasetId: this.datasetId,
      defaultBucket: this.defaultBucket,
      datasetBucket: this.datasetBucket,
      selectedWmsLayerName: this.selectedWmsLayerName,
      selectedWfsFeatureTypeName: this.selectedWfsFeatureTypeName,
      name: this.name
    };

    return runLater(async () => {
      const registryUrl = buildRegistryRecordUrl(properties);
      const record = (await loadJson(
        proxyCatalogItemUrl(this, registryUrl, "1d"),
        this.terria.configParameters.magdaReferenceHeaders
      )) as MagdaPreviewRecord;
      let definition = findCompatibleDefinition(record, properties);

      if (!definition) {
        throw new TerriaError({
          sender: this,
          title: "No compatible distributions",
          message:
            "The selected Magda record has no distribution supported by the preview map."
        });
      }

      definition = await this.resolveServiceFallback(definition);
      const target =
        previousTarget?.type === definition.type
          ? previousTarget
          : CatalogMemberFactory.create(
              definition.type,
              this.uniqueId,
              this.terria,
              this
            );

      if (!target) {
        throw new TerriaError({
          sender: this,
          title: "Unsupported preview type",
          message: `TerriaJS model type ${definition.type} is not registered.`
        });
      }

      const { type: _type, ...targetDefinition } = definition;
      updateModelFromJson(
        target,
        CommonStrata.definition,
        {
          ...targetDefinition,
          ...(definition.type === "wfs"
            ? { maxFeatures: WFS_DEFAULT_MAX_FEATURES }
            : {}),
          ...(definition.type === "esri-featureServer"
            ? { tileRequests: false }
            : {}),
          zoomOnAddToWorkbench: this.zoomOnEnable
        },
        true
      ).throwIfError();
      return target;
    });
  }

  private updateEnabledState(isEnabled: boolean): void {
    if (isEnabled && !this.terria.workbench.contains(this)) {
      this.terria.workbench
        .add(this)
        .then((result) => result.raiseError(this.terria));
    } else if (!isEnabled) {
      this.terria.workbench.remove(this);
    }
  }

  private async resolveServiceFallback(
    definition: MagdaPreviewDefinition
  ): Promise<MagdaPreviewDefinition> {
    if (definition.type === "wms" && !definition.layers) {
      const member = await this.firstGroupMember(
        WebMapServiceCatalogGroup,
        WebMapServiceCatalogItem,
        definition.url
      );
      return { ...definition, layers: member.layers };
    }

    if (definition.type === "wfs" && !definition.typeNames) {
      const member = await this.firstGroupMember(
        WebFeatureServiceCatalogGroup,
        WebFeatureServiceCatalogItem,
        definition.url
      );
      return { ...definition, typeNames: member.typeNames };
    }

    if (
      definition.type === "esri-featureServer" &&
      isFeatureServerRoot(definition.url)
    ) {
      const member = await this.firstGroupMember(
        ArcGisFeatureServerCatalogGroup,
        ArcGisFeatureServerCatalogItem,
        definition.url
      );
      return { ...definition, url: member.url! };
    }

    return definition;
  }

  private async firstGroupMember<
    TGroup extends GroupMixin.Instance & BaseModel,
    TMember extends BaseModel
  >(
    GroupClass: new (id: string, terria: Terria) => TGroup,
    MemberClass: new (...args: never[]) => TMember,
    url: string
  ): Promise<TMember> {
    const group = new GroupClass(`${this.uniqueId}/preview-source`, this.terria);
    group.setTrait(CommonStrata.definition, "url", url);
    (await group.loadMembers()).throwIfError();

    const member = await this.findFirstMember(group, MemberClass);
    if (!member) {
      throw new TerriaError({
        sender: this,
        title: "No compatible service member",
        message: "The selected service contains no usable preview layer."
      });
    }
    return member;
  }

  private async findFirstMember<TMember extends BaseModel>(
    group: GroupMixin.Instance,
    MemberClass: new (...args: never[]) => TMember
  ): Promise<TMember | undefined> {
    for (const member of group.memberModels) {
      if (member instanceof MemberClass) return member;
      if (GroupMixin.isMixedInto(member)) {
        (await member.loadMembers()).throwIfError();
        const nested = await this.findFirstMember(member, MemberClass);
        if (nested) return nested;
      }
    }
    return undefined;
  }

  dispose(): void {
    this.disposeEnableReaction();
    super.dispose();
  }
}
