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
