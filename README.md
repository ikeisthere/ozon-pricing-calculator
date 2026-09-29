# Ozon 跨境定价计算器

这是一个可独立运行、可自行部署和修改的 Ozon 跨境定价计算器开源项目。页面、计算引擎、随包费率目录及本地 API 都在本仓库内；运行时不依赖夸夸跨境工作台、账号、API Key 或官网 API。

## 快速运行

需要 Node.js 18 或更新版本。无需安装第三方依赖：

```sh
node server/app.js
```

浏览器打开 <http://127.0.0.1:8080/>。如需改端口，可设置 `PORT` 环境变量。汇率服务需要联网访问俄罗斯央行；如果暂时不可用，可以在页面手动输入汇率。佣金与物流费率使用仓库内标有版本日期的目录，不会在后台自动替换。

## 项目包含什么

- `pricing-calculator/`：计算器页面、交互和样式。
- `server/app.js`：轻量本地 API 与静态页面服务，只用 Node.js 内置模块。
- `server/pricing-engine.js`、`server/pricing-catalog.js`：售价反推、成本拆分、约束校验和费率读取逻辑。
- `server/data/`：随项目提供的佣金与物流费率目录。来源、版本、更新时间和已知限制见 [`DATA-SOURCES.md`](./DATA-SOURCES.md)。
- `tools/`、`brand-mark.svg`：页面所需的样式、导航脚本和品牌图形。品牌图形不属于 MIT 代码许可，见 [`NOTICE.md`](./NOTICE.md)。

## 费率与计算结果

费率会随 Ozon 政策和承运线路调整。本项目提供的是带版本日期的费率快照，不承诺始终是最新费率。人民币兑卢布参考汇率从俄罗斯央行公开日汇率读取，并显示报价日期；它不是卖家实际结算汇率。最终刊登或调价前，请在 Ozon Seller 和实际物流合同中复核费用。

计算结果是经营测算，不构成 Ozon 官方报价或收益保证。修改费率目录时，请一并更新 [`DATA-SOURCES.md`](./DATA-SOURCES.md) 中的出处与生效日期。

佣金和物流数据是第三方来源的费率快照，不属于 MIT 许可的代码。部分原始工作簿或下载链接目前未包含在仓库中，数据转换也未完全做到可复现；具体范围见 [`DATA-SOURCES.md`](./DATA-SOURCES.md)。

## 开发与验证

```sh
node --test tests/*.test.mjs server/tests/*.test.js
```

也可只检查核心计算引擎：

```sh
node --test server/tests/pricing-engine.test.js
```

贡献指南见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。欢迎提交问题和改进 PR；经审查合并的改进会进入本项目，供所有使用者获取。若改动需要同步到夸夸跨境线上计算器，项目维护者会另行安排，不影响本仓库作为独立开源项目的使用和贡献。

## 许可

软件代码采用 MIT License，见 [`LICENSE`](./LICENSE)。Ozon 名称仅用于说明兼容对象；Ozon 商标及第三方费率资料不因此转授许可。夸夸跨境名称与标识的使用边界见 [`NOTICE.md`](./NOTICE.md)。

---

English: An independently runnable, open-source Ozon cross-border pricing calculator. It includes the UI, calculation engine, versioned data snapshots, and a local API. See [`DATA-SOURCES.md`](./DATA-SOURCES.md) for provenance and limitations.
