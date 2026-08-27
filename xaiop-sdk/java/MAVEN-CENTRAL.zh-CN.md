# Maven Central — Java SDK

[English](MAVEN-CENTRAL.md) · [简体中文](MAVEN-CENTRAL.zh-CN.md)

已发布坐标：**`io.github.aboutuip:xaiop:0.15.1`** · 协议 **0.6.0**。  
Java 包名仍是 **`io.xaiop.*`**。旧文档若仍写未上架的 GAV `io.xaiop:xaiop`，消费方必须用 `io.github.aboutuip`。

检索：[central.sonatype.com/artifact/io.github.aboutuip/xaiop](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop)

## 拉取

Maven：

```xml
<dependency>
  <groupId>io.github.aboutuip</groupId>
  <artifactId>xaiop</artifactId>
  <version>0.15.1</version>
</dependency>
```

Gradle：

```kotlin
implementation("io.github.aboutuip:xaiop:0.15.1")
```

指南：[../../docs/sdk/java/README.zh-CN.md](../../docs/sdk/java/README.zh-CN.md)。

命名空间是 GitHub 的 **`io.github.aboutuip`**（由 `AboutUip` 组织验证）。`io.xaiop` 需要域名 `xaiop.io`，**不是**已发布的 GAV。

## 维护者再发布

### 1. 用户 Token → `~/.m2/settings.xml`

Portal → Account → **Generate User Token**：

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

**不要**提交到 Git。`id` 必须与 pom 里 `publishingServerId` = `central` 一致。

### 2. GPG 签名密钥

```bash
gpg --list-secret-keys --keyid-format LONG
gpg --armor --export YOUR_KEY_ID
# 粘贴到 https://keys.openpgp.org
```

```powershell
$env:GPG_PASSPHRASE = '...'
```

### 3. 上传

```bash
cd xaiop-sdk/java
mvn -Pcentral -DskipTests clean deploy
```

pom 默认 `autoPublish=false`：SUCCESS 后到  
[Deployments](https://central.sonatype.com/publishing/deployments) 点 **Publish**。

## 本地试签（不上传）

```bash
mvn -Pcentral -DskipTests clean package gpg:sign
```
