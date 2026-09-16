# Versioning and release process

This guide describes how to publish `magda-preview-map` without mixing functional changes into release-only commits. A release publishes two artifacts:

- the multi-architecture image `ghcr.io/magda-io/magda-preview-map`;
- the Helm chart `oci://ghcr.io/magda-io/charts/magda-preview-map`.

Docker Hub and the legacy S3 Helm repository are not release targets.

## Version format

Release tags and set-version workflow inputs use [Semantic Versioning](https://semver.org/) with a required leading `v`:

```text
v2.0.0-alpha.0
│ │ │ │
│ │ │ └─ prerelease identifier
│ │ └─ patch
│ └─ minor
└─ major
```

Examples include `v2.0.0-alpha.0`, `v2.0.0-rc.1`, and `v2.0.0`. `package.json` and the Helm `Chart.yaml` store the same version without the leading `v`.

## Release principles

- Merge all functional changes into the chosen source branch before creating a release branch.
- Create the release branch from a source commit whose normal CI has passed.
- A release branch contains only the version and release metadata needed for that release. Do not add feature or bug-fix work there.
- The release tag, `package.json` version, and Helm chart version must identify the same release.
- Prerelease tags such as `v2.0.0-alpha.0` must be marked as prereleases in GitHub and must not be marked as the latest release.
- Do not publish from an unreviewed source branch.

## Release flow

```text
source branch
  -> release/v<VERSION>
  -> set-version workflow
  -> branch CI
  -> GitHub Release targeting the release branch
  -> GHCR image + OCI Helm chart
  -> independent artifact verification
```

### 1. Prepare the source branch

Choose the source branch for the release. For the planned TerriaJS 8 alpha this is the reviewed branch or commit designated by the release ticket; stable releases should normally start from `main`.

Before proceeding:

1. merge every functional change intended for the release;
2. confirm the source commit passes the Main CI Workflow;
3. confirm no additional code change is expected on the release branch.

### 2. Create the release branch

Create `release/v<VERSION>` from the approved source commit. For example:

```bash
git switch <source-branch>
git pull --ff-only
git switch -c release/v2.0.0-alpha.0
git push -u origin release/v2.0.0-alpha.0
```

The branch name and eventual GitHub tag should use the same leading-`v` version.

### 3. Run the set-version workflow

In GitHub, open **Actions**, choose **set-version**, and run it on the new release branch. Enter the full version with its leading `v`, for example `v2.0.0-alpha.0`.

The workflow:

1. validates the input as semantic version syntax with a required leading `v`;
2. updates `package.json` and `deploy/helm/magda-preview-map/Chart.yaml` to the version without `v`;
3. regenerates the Helm chart section in `README.md`;
4. commits and pushes only that release metadata to the selected release branch.

Do not manually add functional changes to this commit.

### 4. Wait for release-branch CI

The version commit triggers the Main CI Workflow. Wait for all jobs to pass. CI runs:

- Node 22 dependency installation, lint, unit/contract tests, and the production build;
- Playwright iframe integration tests;
- Helm dependency build, lint, render, and generated README consistency checking;
- a non-publishing Node 24 container build for `linux/amd64` and `linux/arm64`.

Do not create the GitHub Release while this CI run is failing or still in progress.

### 5. Create the GitHub Release

Create a GitHub Release with:

- **Tag:** the exact leading-`v` version, such as `v2.0.0-alpha.0`;
- **Target:** the matching release branch, such as `release/v2.0.0-alpha.0`;
- **Title:** the version or a concise release title;
- **Prerelease:** enabled for alpha, beta, and release-candidate versions;
- **Latest release:** disabled for prereleases.

Publishing the GitHub Release triggers `.github/workflows/release.yml`. Before publishing, that workflow validates the tag against both `package.json` and the Helm chart. It then:

1. repeats the release-critical application and Helm checks;
2. builds and pushes a Node 24 image for `linux/amd64` and `linux/arm64` with both `ghcr.io/magda-io/magda-preview-map:<VERSION>` and an immutable source-commit SHA tag;
3. packages and pushes the chart as `oci://ghcr.io/magda-io/charts/magda-preview-map` at `<VERSION>`.

Artifact versions omit the tag's leading `v`.

### 6. Verify the published artifacts

Verification must be independent of the release build workspace. Replace `<VERSION>` with the version without `v`.

Pull and inspect the image:

```bash
docker pull ghcr.io/magda-io/magda-preview-map:<VERSION>
docker buildx imagetools inspect ghcr.io/magda-io/magda-preview-map:<VERSION>
```

Confirm that the manifest contains both `linux/amd64` and `linux/arm64`.

Pull and inspect the Helm chart:

```bash
helm show chart oci://ghcr.io/magda-io/charts/magda-preview-map --version <VERSION>
helm pull oci://ghcr.io/magda-io/charts/magda-preview-map --version <VERSION>
```

Also confirm that the GitHub Release points at the intended release-branch commit and that its release workflow completed successfully.

## Failure handling

- **Invalid set-version input:** rerun the workflow with a valid leading-`v` semantic version.
- **Version mismatch during release:** delete the unpublished or failed release/tag as appropriate, correct the release branch with the set-version workflow, allow CI to pass, and recreate the release with the exact matching tag.
- **CI failure:** fix the problem on the original source branch first, then create a new release branch/version as appropriate. Do not turn the release branch into a functional development branch.
- **Partially published artifacts:** do not overwrite an existing version. Diagnose the failure and use the next appropriate semantic version for a corrected release.
