# Ozon 跨境定价计算器

面向中国 Ozon 卖家的免费免登录定价工具。输入商品类目、采购成本、包裹信息、履约与物流选项和目标利润，查看建议售价及费用拆分。

**在线体验：**[夸夸跨境 Ozon 跨境定价计算器](https://kuakuakua.com/pricing-calculator/)

## 功能

- 按商品类目和履约方式匹配佣金。
- 根据商品成本和目标利润反推售价。
- 选择配送国家、履约方式、跨境物流商与渠道，查看费用估算。
- 桌面端三级类目浏览、移动端类目搜索和最近使用记录。
- 输入有效后自动更新结果，无需每次点击计算按钮。

## 数据与服务依赖

页面从夸夸跨境工作台的公开定价 API 读取类目、物流费率、汇率及计算结果；本仓库不包含 Ozon 店铺凭证、API Key 或用户数据，也不内置费率快照。费率和汇率会变化，计算结果仅供经营测算；刊登或改价前，请在 Ozon Seller 核对当时规则和费用。

本地静态预览可以用 Python 启动：

```powershell
python -m http.server 8080
```

打开 `http://127.0.0.1:8080/pricing-calculator/`。完整交互预览需要本机工作台 API 正在 `127.0.0.1:18084` 运行；本仓库不包含工作台后端。正式使用请通过上方官网入口。

离线结构与脚本检查：

```powershell
node --test tests/*.test.mjs
```

## 项目结构

- `pricing-calculator/`：计算器页面、样式和交互。
- `tools/tools.css`、`tools/tools.js`：官网共享页头、导航和页脚样式/交互依赖。
- `brand-mark.svg`：官网品牌标识资源（不包含在代码许可授权内，见 `NOTICE.md`）。
- `scripts/sync-from-homepage.ps1`：从官网真源按白名单同步文件；不会复制主站其他页面、部署材料或 Git 历史。

## 维护与贡献

官网生产代码的唯一真源是 [`kuakuakua-homepage`](https://github.com/ikeisthere/kuakuakua-homepage) 仓库。本仓库是经过筛选的公开源码镜像，不是生产部署仓库。功能修改先在官网真源完成并验证，再运行同步脚本更新本仓库；来自本仓库的 Issue/PR 建议由维护者评估后回到官网真源实现，避免两份代码分别演进。

同步命令（在本仓库 PowerShell 中运行）：

```powershell
./scripts/sync-from-homepage.ps1
```

## License

计算器软件代码采用 MIT License，见 [`LICENSE`](./LICENSE)。夸夸跨境名称、商标和品牌标识不随该许可授权，详见 [`NOTICE.md`](./NOTICE.md)。

---

English: A free Ozon cross-border pricing calculator for Chinese sellers. [Try the official web version](https://kuakuakua.com/pricing-calculator/). The production implementation lives in the KuaKuaKua homepage repository; this repository is a curated source mirror, not a deployment target.
