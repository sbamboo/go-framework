# Minecraft Versions
`https://piston-meta.mojang.com/mc/game/version_manifest.json`
returns a format like
```json
{
    // First the ids for latest release and snapshot
    "latest": {
        "release": "1.21.11",
        "snapshot": "26.1-snapshot-9"
    },
    // Then all versions
    "versions": [
    // Snapshots past 1.21.11 have changed naming scheme to {mcver}-snapshot-{n}
    {
        "id": "26.1-snapshot-9",
        "type": "snapshot",
        "url": "https://piston-meta.mojang.com/v1/packages/8fb4e9a11aa92851dceeb062c5cacc71478cc988/26.1-snapshot-9.json",
        "time": "2026-02-18T10:18:51+00:00",
        "releaseTime": "2026-02-18T10:13:30+00:00"
    // Versions will be like "26.1", but before that 1.{major}.{minor} 
    }, {
        "id": "1.21.11",
        "type": "release",
        "url": "https://piston-meta.mojang.com/v1/packages/8156c7ce77b891c21f5eba60669e9df43a8a44f9/1.21.11.json",
        "time": "2026-02-18T06:40:31+00:00",
        "releaseTime": "2025-12-09T12:23:30+00:00"
    // Pre 26.1 release candidates
    }, {
        "id": "1.21.11-rc3",
        "type": "snapshot",
        "url": "https://piston-meta.mojang.com/v1/packages/9bd36b7d6c6e739bbbaed3b090f675e32f536b00/1.21.11-rc3.json",
        "time": "2026-02-18T06:40:31+00:00",
        "releaseTime": "2025-12-08T13:17:37+00:00"
    // Pre 26.1 pre releases
    }, {
        "id": "1.21.11-pre5",
        "type": "snapshot",
        "url": "https://piston-meta.mojang.com/v1/packages/b5eb01960465c9acf708c99577523b4f1287c46a/1.21.11-pre5.json",
        "time": "2026-02-18T06:40:31+00:00",
        "releaseTime": "2025-12-03T13:14:25+00:00"
    // {year:2}w{weeknr}{abc:1}  YYwNNn
    }, {
        "id": "25w46a",
        "type": "snapshot",
        "url": "https://piston-meta.mojang.com/v1/packages/dc39a035a94dd5bc4ecb68a78239fb4289c42819/25w46a.json",
        "time": "2026-02-18T06:39:55+00:00",
        "releaseTime": "2025-11-11T13:05:00+00:00"
    // Three example aprilsfools
    }, {
        "id": "25w14craftmine",
        "type": "snapshot",
        "url": "https://piston-meta.mojang.com/v1/packages/66f6b9236563ad99143f973d441746d1d5e374e0/25w14craftmine.json",
        "time": "2026-02-18T06:37:34+00:00",
        "releaseTime": "2025-04-01T15:50:09+00:00"
    }, {
        "id": "24w14potato",
        "type": "snapshot",
        "url": "https://piston-meta.mojang.com/v1/packages/867044d95bfb321e500ea91cffdc351f45cad11e/24w14potato.json",
        "time": "2026-02-18T06:32:15+00:00",
        "releaseTime": "2024-04-01T11:07:19+00:00"
    }, {
        "id": "23w13a_or_b",
        "type": "snapshot",
        "url": "https://piston-meta.mojang.com/v1/packages/cd7e74eada585305b8bf01d8265ae953a9f5507b/23w13a_or_b.json",
        "time": "2026-02-18T06:41:00+00:00",
        "releaseTime": "2023-04-01T12:52:18+00:00"
    // Pre 26.1 no minor versions
    }, {
        "id": "1.13",
        "type": "release",
        "url": "https://piston-meta.mojang.com/v1/packages/c24c2fd37c8ca2e1c18721e2c77caf4d24c87f92/1.13.json",
        "time": "2023-06-07T11:41:22+00:00",
        "releaseTime": "2018-07-18T15:11:46+00:00"
    }, {
        "id": "1.0",
        "type": "release",
        "url": "https://piston-meta.mojang.com/v1/packages/75062586b830dd5160f13f1c9130eb365e01f1b9/1.0.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2011-11-17T22:00:00+00:00"
    // Old beta
    }, {
        "id": "b1.8.1",
        "type": "old_beta",
        "url": "https://piston-meta.mojang.com/v1/packages/440e3b845c3991492a3d0c5f0ccfda78ab90d9b6/b1.8.1.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2011-09-18T22:00:00+00:00"
    // Old alpha 
    }, {
        "id": "a1.2.6",
        "type": "old_alpha",
        "url": "https://piston-meta.mojang.com/v1/packages/1c888e4d8aed380db25aeb3835f5918297bb5e3a/a1.2.6.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2010-12-02T22:00:00+00:00"
    // Inf old alphas there is also ids like "inf-20100625-0922" and "in-20091223-1459"
    }, {
        "id": "inf-20100618",
        "type": "old_alpha",
        "url": "https://piston-meta.mojang.com/v1/packages/51a5c512af384d3d2a79a3efb93f7d4b9a1c6ec2/inf-20100618.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2010-06-15T22:00:00+00:00"
    // classic old alphas there is also ids like "0.24_SURVIVAL_TEST"
    }, {
        "id": "c0.30_01c",
        "type": "old_alpha",
        "url": "https://piston-meta.mojang.com/v1/packages/9392d3f635770ac4dfd3f8c9444f319b00b08945/c0.30_01c.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2009-12-21T22:00:00+00:00"
    }, {
        "id": "c0.0.13a",
        "type": "old_alpha",
        "url": "https://piston-meta.mojang.com/v1/packages/5ef11c52e02c27f40924ea0c323efee716de568d/c0.0.13a.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2009-05-30T22:00:00+00:00"
    }, {
        "id": "c0.0.13a_03",
        "type": "old_alpha",
        "url": "https://piston-meta.mojang.com/v1/packages/21122dee2365147033ef6214702098cf7b2549bd/c0.0.13a_03.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2009-05-21T22:00:00+00:00"
    // RubyDung versions (pre classic)    there is also alternative "mc-" prefixed retroactive naming example "mc-161648"
    }, {
        "id": "rd-161348",
        "type": "old_alpha",
        "url": "https://piston-meta.mojang.com/v1/packages/f22a3882d124ef4468f6eb50b12836c53286e18a/rd-161348.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2009-05-16T11:48:00+00:00"
    }, {
        "id": "rd-160052",
        "type": "old_alpha",
        "url": "https://piston-meta.mojang.com/v1/packages/0cac2ceab812568826c6e5aeb4cf980397550479/rd-160052.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2009-05-15T22:52:00+00:00"
    }, {
        "id": "rd-20090515",
        "type": "old_alpha",
        "url": "https://piston-meta.mojang.com/v1/packages/a3165080e2b0bf20519eac5f55ee841f3491e277/rd-20090515.json",
        "time": "2022-03-10T09:51:38+00:00",
        "releaseTime": "2009-05-14T22:00:00+00:00"
    }]
}
```

# Fabric Versions
`https://meta.fabricmc.net/v2/versions/loader`
returns a format like
```json
[
    {
        "separator": ".",
        "build": 4,
        "maven": "net.fabricmc:fabric-loader:0.18.4",
        "version": "0.18.4",
        "stable": true
    },
    {
        "separator": ".",
        "build": 3,
        "maven": "net.fabricmc:fabric-loader:0.18.3",
        "version": "0.18.3",
        "stable": false
    },
    {
        "separator": ".",
        "build": 2,
        "maven": "net.fabricmc:fabric-loader:0.18.2",
        "version": "0.18.2",
        "stable": false
    }
]
```

# Forge Versions
`https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json`
returns a format like this
```json
{
    // Generally ids are {mc}-{ver}-{suffix} where mc can be {mcver} or {mcver}_{mcsuffix}
    // If forge releases for snapshots its likely as 24w05a-xx.x.x or similar
    "1.1": [
        "1.1-1.3.2.1" // {mc}-{ver}
    ],
    "1.7.2": [
        "1.7.2-10.12.2.1133",
        "1.7.2-10.12.2.1145",
        "1.7.2-10.12.2.1147",
        "1.7.2-10.12.2.1154-mc172", // {mc}-{ver}-mc{nr}
        "1.7.2-10.12.2.1155-mc172",
        "1.7.2-10.12.2.1161-mc172"
    ],
    "1.7.10_pre4": [
        "1.7.10_pre4-10.12.2.1148-prerelease", // {mc}_{pre}-{ver}-{prerelease_suffix}
        "1.7.10_pre4-10.12.2.1149-prerelease"
    ],
    "1.7.10": [
        "1.7.10-10.13.0.1206",
        "1.7.10-10.13.0.1207",
        "1.7.10-10.13.0.1208",
        "1.7.10-10.13.1.1210-new", // -new suffix
        "1.7.10-10.13.1.1211-new",
        "1.7.10-10.13.1.1212-new",
        "1.7.10-10.13.1.1213-new",
        "1.7.10-10.13.1.1214-new",
        "1.7.10-10.13.1.1215-new",
        "1.7.10-10.13.1.1216-new",
        "1.7.10-10.13.2.1291",
        "1.7.10-10.13.2.1300-1.7.10",
        "1.7.10-10.13.2.1307-1.7.10",
        "1.7.10-10.13.2.1340-1.7.10",
        "1.7.10-10.13.3.1388-1.7.10", // mc suffix
        "1.7.10-10.13.3.1389-1710ls", // secondary mcsuffix
        "1.7.10-10.13.3.1391-1710ls",
        "1.7.10-10.13.3.1393-1710ls",
        "1.7.10-10.13.3.1394-1710ls",
        "1.7.10-10.13.3.1395-1710ls",
        "1.7.10-10.13.3.1399-1.7.10",
        "1.7.10-10.13.3.1400-1.7.10",
        "1.7.10-10.13.3.1401-1710ls",
        "1.7.10-10.13.3.1403-1.7.10",
        "1.7.10-10.13.3.1406-1.7.10",
    ],
    "1.8": [
        "1.8-11.14.0.1294-1.8",
        "1.8-11.14.0.1295-1.8",
        "1.8-11.14.0.1296",
        "1.8-11.14.0.1297",
        "1.8-11.14.0.1298",
    ],
    "1.8.8": [
        "1.8.8-11.14.4.1575-1.8.8",
        "1.8.8-11.14.4.1576-1.8.8",
        "1.8.8-11.14.4.1579-1.8.8",
    ],
    "1.8.9": [
        "1.8.9-11.15.1.1875",
        "1.8.9-11.15.1.1890-1.8.9",
        "1.8.9-11.15.1.1902-1.8.9",
        "1.8.9-11.15.1.2318-1.8.9"
    ],
    "1.9.4": [
        "1.9.4-12.17.0.1916-1.9.4",
        "1.9.4-12.17.0.1917-1.9.4",
        "1.9.4-12.17.0.1918-1.9.4",
        "1.9.4-12.17.0.1919-EHUnit", // Special suffix
        "1.9.4-12.17.0.1937",
        "1.9.4-12.17.0.1939",
        "1.9.4-12.17.0.1940",
    ],
    "1.10.2": [
        "1.10.2-12.18.0.2006-1.10.0",
        "1.10.2-12.18.0.2007-1.10.0",
        "1.10.2-12.18.1.2012",
        "1.10.2-12.18.1.2013",
        "1.10.2-12.18.1.2014",
        "1.10.2-12.18.1.2015-failtests", // Special suffix
        "1.10.2-12.18.1.2016-failtests",
    ],
    "1.11": [
        "1.11-13.19.0.2126-1.11.x", // mc.x suffix
        "1.11-13.19.0.2127-1.11.x",
        "1.11-13.19.0.2128-1.11.x",
        "1.11-13.19.0.2129-1.11.x",
        "1.11-13.19.0.2130",
    ],
    "1.11.2": [
        "1.11.2-13.20.0.2243",
        "1.11.2-13.20.0.2244",
        "1.11.2-13.20.0.2245-3630", // id suffix
    ],
    "1.12.2": [
        "1.12.2-14.23.4.2719",
        "1.12.2-14.23.4.2720-4627",
    ],
    "1.17.1": [
        "1.17.1-37.0.127",
        "1.17.1-37.1.0",
        "1.17.1-37.1.1"
    ],
}
```

# Forge Promotions
`https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`
returns like this (trimmed result!) but some versions does nto have -latest -recommended must have both.
```json
{
    "homepage": "https://files.minecraftforge.net/net/minecraftforge/forge/",
    "promos": {
        "1.1-latest": "1.3.4.29",
        "1.2.5-latest": "3.4.9.171",
        "1.4.7-latest": "6.6.2.534",
        "1.5-latest": "7.7.0.598",
        "1.7.10-recommended": "10.13.4.1614",
        "1.8-latest": "11.14.4.1577",
        "1.8-recommended": "11.14.4.1563",
        "1.8.8-latest": "11.15.0.1655",
        "1.21.9-latest": "59.0.5",
        "1.21.10-latest": "60.1.8",
        "1.21.10-recommended": "60.1.0",
        "1.21.11-latest": "61.1.1",
        "1.21.11-recommended": "61.1.0"
    }
}
```