# Google Home Android SDK — reproducible local setup

The `GoogleHomePlugin` (ADR-036, P09) depends on two AAR artifacts that are
**not available on Maven Central or Google's Maven repository**:

| groupId | artifactId | version |
| --- | --- | --- |
| `com.google.android.gms` | `play-services-home` | `17.1.0` |
| `com.google.android.gms` | `play-services-home-types` | `17.1.0` |

This is confirmed by Google's own documentation, not an oversight on our
side: *"The Home APIs in this open beta are not yet part of the standard
libraries provided by Google for development. In order to develop
applications with the Home APIs, you need to download and host the
libraries locally."* (developers.home.google.com/apis/android/sdk).

## Why this repo does not commit or rehost the AARs

The artifacts are licensed under the **Android Software Development Kit
License Agreement** (declared in their own POM files, `<license>` block —
the same license every Play Services artifact ships under:
https://developer.android.com/studio/terms.html). That license explicitly
states, Section 3.4: *"you may not copy (except for backup purposes),
modify, adapt, **redistribute**, decompile, reverse engineer, disassemble,
or create derivative works of the SDK or any part of the SDK"*, and the
grant itself (Section 3.1) is **non-sublicensable**.

This means: committing the `.aar` files to this repository, hosting them
on GitHub Packages, DigitalOcean Spaces, or any other private Maven
registry, or otherwise sharing our downloaded copy with other developers
or CI would be a redistribution of the SDK — not something this license
permits. **Every environment (each developer's machine, and CI/staging if
that build target is ever enabled there) must download its own copy
directly from Google**, the same way GH02 and P09 did.

This is a real constraint on build reproducibility, not a convenience
choice — see the `v1.6.0 — P10` Trello card for the full trade-off
analysis and the open question about CI/staging automation this leaves.

## How to get the artifacts

1. Sign in at the Google Home Developers portal
   (developers.home.google.com) with the Google account enrolled in the
   Home APIs open beta for this project.
2. Download the Android SDK per the official setup guide:
   https://developers.home.google.com/apis/android/sdk
3. You need exactly these two files (plus their `.pom` — most download
   flows include it): `play-services-home-17.1.0.aar` and
   `play-services-home-types-17.1.0.aar`. If the portal now serves a
   different version, **stop** — P09 was built and verified against
   `17.1.0` specifically; see "Version changes" below before upgrading.
4. Lay the files out as a standard local Maven repository at
   `android/google-home-sdk-repo/` (gitignored — never commit this
   directory), matching this structure:
   ```
   android/google-home-sdk-repo/com/google/android/gms/play-services-home/17.1.0/play-services-home-17.1.0.aar
   android/google-home-sdk-repo/com/google/android/gms/play-services-home/17.1.0/play-services-home-17.1.0.pom
   android/google-home-sdk-repo/com/google/android/gms/play-services-home-types/17.1.0/play-services-home-types-17.1.0.aar
   android/google-home-sdk-repo/com/google/android/gms/play-services-home-types/17.1.0/play-services-home-types-17.1.0.pom
   ```
   `android/app/build.gradle` already declares this path as a Maven
   repository (`maven { url = uri('../google-home-sdk-repo') }`) and the
   two artifacts as regular dependencies — no other Gradle change is
   needed once the files are in place.

## Verifying you have the exact right bytes

Gradle **dependency verification** is enabled for this project
(`android/gradle/verification-metadata.xml`, generated via
`./gradlew --write-verification-metadata sha256`) and covers every
resolved dependency in the build, these two included. If the files you
downloaded don't hash to what's recorded there, **the build will fail
with a dependency verification error** — that is the integrity check
working as intended, not a bug. Do not "fix" a verification failure by
regenerating the metadata against a different file; treat it as a signal
that you have the wrong artifact and re-download from the official source.

For reference, the exact bytes this project was built and physically
tested against (GH02, P09) hash to:

| artifact | SHA-256 |
| --- | --- |
| `play-services-home-17.1.0.aar` | `dd088a22a0fc16886ee8a81bb86db9efc254378cf68b5cf4d59c5a7c1405b02b` |
| `play-services-home-types-17.1.0.aar` | `4eda000761e067ec5b009a1b2cf6fce67f32dbf15628d1dcf8846db58f303003` |

These match the `.sha1`/`.md5` sidecar files that ship alongside the
artifacts in the same download, and are recorded independently in
`verification-metadata.xml`. They have **not** been independently
verified against a checksum Google itself publishes on a web page —
no such published checksum was found. Treat this as strong (self-
consistent, sidecar-file-backed) evidence, not an independently
Google-attested guarantee.

## Version changes

If a future SDK update is required, regenerate the verification metadata
after placing the new files:
```
cd android && ./gradlew --write-verification-metadata sha256 :app:compileDebugKotlin
```
Then update `com.google.android.gms:play-services-home*` versions in
`android/app/build.gradle` and re-verify every API surface `GoogleHomePlugin`
depends on still exists with the same shape (this project has already been
burned once by trusting a secondhand claim about this SDK's API surface
over the real, extracted bytecode — see the P09 Trello card).

## CI/CD and Build Environment Limitation

### 1. Current Google distribution model

Google Home Android SDK `17.1.0` is distributed exclusively through an
authenticated download from the Google Home Developers portal (see
"How to get the artifacts" above). It is **not** available through Maven
Central, Google's Maven repository, or any other standard public package
repository — confirmed directly from Google's own documentation
(developers.home.google.com/apis/android/sdk): *"The Home APIs in this
open beta are not yet part of the standard libraries provided by Google
for development."*

### 2. CI limitation

P10 investigated whether an automated CI environment can obtain this SDK
directly from Google through any officially documented mechanism —
service account download, OAuth machine-to-machine flow, Workload
Identity / Workload Identity Federation, a CLI, an API endpoint, or
documented GitHub Actions / Cloud Build integration. **None was found.**
Every official page checked (SDK setup, get-started, API overview,
release notes, OAuth setup, Developer Policies) describes exactly one
access path: an interactive human sign-in.

**This is a Google distribution limitation, not an Ixora code
limitation.** Nothing in this repository's build configuration is the
cause — there is simply no machine identity Google's own SDK download
flow currently accepts.

Developer/local environment (works today):
```
Developer machine
    ↓
Google Home SDK obtained manually (interactive sign-in)
    ↓
Gradle build
    ↓
Ixora Android build
```

Current automated CI (does not work today):
```
CI runner
    ↓
Attempt to download Google Home SDK automatically
    ↓
No official documented mechanism
    ↓
Build cannot resolve the SDK unless the environment already has it
```

### 3. Important licensing constraint

The SDK's own POM declares the Android Software Development Kit License
Agreement. Based on the P10 investigation, no explicit redistribution
exception for this use case was identified. Any future redistribution or
internal artifact-hosting approach — committing the AAR to this
repository, a private Maven repository, GitHub Packages, DigitalOcean
Spaces/S3, a Docker image, or any other package distribution mechanism —
must be validated against the applicable Google/Android SDK terms before
adoption. This document does not offer a legal opinion; it records what
the investigation did and did not find documented.

### 4. Possible future solutions

**Option A — Developer machine**

A developer manually obtains the SDK from Google Home Developers and
builds locally.

Status:
- Currently supported operational workflow.
- Suitable for current development.
- Not ideal as the long-term release process.

**Option B — Dedicated/self-hosted Android build runner**

A dedicated build machine/runner could potentially have the Google Home
SDK installed manually beforehand and then execute the normal Gradle
build:
```
GitHub Actions
    ↓
Self-hosted Android runner
    ↓
Google Home SDK already installed
    ↓
Gradle build
    ↓
AAB
```
This is documented here only as a **technically possible future
architecture** — Google has not explicitly approved this setup, and it
requires confirmation that keeping the SDK on such a build environment is
compliant with the applicable license/terms before adoption. This is
particularly relevant for a future production/Play Store release
pipeline.

**Option C — Docker/build image containing the SDK**

Creating a Docker image containing the Google Home AARs would be
technically possible, but is **not currently an approved/recommended
solution**: distributing an image containing the SDK may constitute
redistribution under the same license constraint in §3. This option is
not recommended unless the licensing terms are explicitly validated.

**Option D — Official Google automated distribution**

If Google later provides an official Maven repository, API, CLI,
service-account flow, or another supported machine-to-machine
distribution mechanism, CI could be revisited. This is the **preferred
long-term solution** if and when Google provides one.

### 5. Future impact

This limitation does **not** prevent Ixora from:
- including Google Home functionality in the Android application;
- developing the Google Home integration;
- producing an Android release from an authorized environment (a
  developer machine that has obtained the SDK per §"How to get the
  artifacts");
- publishing the resulting application to Google Play.

The limitation is specifically about **how the build environment obtains
and provides the Google Home SDK** — it is separate from, and does not
block, the Android application build itself or Play Store publication.
To be explicit about the three distinct concerns this document touches:

1. **SDK download/distribution** — constrained as described above.
2. **Android application build** — unaffected; works from any environment
   that has the SDK, exactly as GH02 and P09 already demonstrated.
3. **Play Store publication** — a separate process entirely, downstream
   of a successful build, not addressed by this constraint at all.

This becomes more important when:
- another developer joins the project;
- Android builds need to be reproducible across multiple machines;
- automated release builds are established;
- the production/Play Store pipeline is prepared.

### 6. Decision from P10

P10 decision: do not implement a CI SDK download workaround. Treat the
current Google Home SDK distribution model as an external constraint and
revisit the build infrastructure when the project requires
multi-developer or automated Android release builds.

### 7. Future revisit trigger

Revisit this decision when:
- Ixora introduces automated Android release builds;
- a second developer needs to build the Android target;
- Google changes the Home APIs SDK distribution model;
- a new SDK version becomes available through a standard Google
  repository;
- a compliant self-hosted build environment is being designed.
