# Maven Central — Java SDK

[English](MAVEN-CENTRAL.md) · [简体中文](MAVEN-CENTRAL.zh-CN.md)

Published coordinates: **last on Central `io.github.aboutuip:xaiop:0.15.1`** (protocol **0.6.0**).  
This tree: **`0.16.0`** · protocol **0.7.0** Draft — snippets below match the tree; Central still serves **0.15.1** until this cut is deployed.  
Java packages remain **`io.xaiop.*`**. Older docs may still write the unpublished GAV `io.xaiop:xaiop` — consumers must use `io.github.aboutuip`.

Portal: [central.sonatype.com/artifact/io.github.aboutuip/xaiop](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop)

## Consume

Maven:

```xml
<dependency>
  <groupId>io.github.aboutuip</groupId>
  <artifactId>xaiop</artifactId>
  <version>0.16.0</version>
</dependency>
```

Gradle:

```kotlin
implementation("io.github.aboutuip:xaiop:0.16.0")
```

Guide: [../../docs/sdk/java/README.md](../../docs/sdk/java/README.md).

The namespace is GitHub’s **`io.github.aboutuip`** (verified from the `AboutUip` GitHub org). `io.xaiop` would need the `xaiop.io` domain and is **not** the published GAV.

## Maintainer republish

### 1. User token in `~/.m2/settings.xml`

Portal → Account → **Generate User Token**:

```xml
<settings>
  <servers>
    <server>
      <id>central</id>
      <username>TOKEN_USERNAME</username>
      <password>TOKEN_PASSWORD</password>
    </server>
  </servers>
</settings>
```

Do **not** commit this file. `id` must match pom `publishingServerId` = `central`.

### 2. GPG signing key

```bash
gpg --list-secret-keys --keyid-format LONG
gpg --armor --export YOUR_KEY_ID
# paste at https://keys.openpgp.org
```

```powershell
$env:GPG_PASSPHRASE = '...'   # PowerShell session only
```

### 3. Deploy

```bash
cd xaiop-sdk/java
mvn -Pcentral -DskipTests clean deploy
```

With `autoPublish=false` (default in pom): after SUCCESS, open  
[Deployments](https://central.sonatype.com/publishing/deployments) → **Publish**.

## Local dry-run (no upload)

```bash
mvn -Pcentral -DskipTests clean package gpg:sign
```
