(() => {
  const api = "/api/pricing/";
  const $ = (id) => document.getElementById(id);
  const state = {
    categories: [], logistics: null, sources: [], selectedCategoryId: "", categorySearch: "",
    categoryTop: "", categoryMiddle: "", mobileStep: "top", mobileSearch: "",
    mobileTop: "", mobileMiddle: "", mobileDraftId: "", exchangeRate: null,
    calculationTimer: null, calculationResultKey: "", calculationsInFlight: new Set()
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  async function request(path, options = {}) {
    const response = await fetch(api + path, { credentials: "omit", headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }, ...options });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "暂时无法完成，请稍后重试。");
    return body;
  }
  const moneyCny = (value) => `¥ ${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  const moneyRub = (value) => `₽ ${Math.round(Number(value || 0)).toLocaleString("zh-CN")}`;
  const number = (id, fallback = 0) => Number.isFinite(Number($(id)?.value)) ? Number($(id).value) : fallback;
  const selectedCategory = () => state.categories.find((row) => row.id === state.selectedCategoryId) || null;
  const categoryPath = (row) => row ? `${row.top} / ${row.middle} / ${row.leaf}` : "";
  const unique = (rows, key) => [...new Set(rows.map((row) => String(row[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));

  function renderCategoryPicker() {
    const host = $("pricingCalcCategoryColumns");
    const search = state.categorySearch.trim().toLocaleLowerCase();
    if (!state.categories.length) {
      host.innerHTML = '<div class="empty">类目暂时无法加载，请刷新页面后重试。</div>';
      return;
    }
    if (search) {
      const matches = state.categories.filter((row) => `${row.top} ${row.middle} ${row.leaf}`.toLocaleLowerCase().includes(search)).slice(0, 80);
      host.innerHTML = `<section class="pricing-category-column pricing-category-search-results"><h3>搜索结果（${matches.length}${matches.length === 80 ? "+" : ""}）</h3>${matches.length ? matches.map((row) => `<button class="pricing-category-option${row.id === state.selectedCategoryId ? " active" : ""}" type="button" data-leaf="${escapeHtml(row.id)}">${escapeHtml(row.leaf)}<small>${escapeHtml(row.top)} / ${escapeHtml(row.middle)}</small></button>`).join("") : '<div class="empty">没有找到相近类目，请换个词试试。</div>'}</section>`;
      return;
    }
    const tops = unique(state.categories, "top");
    const top = tops.includes(state.categoryTop) ? state.categoryTop : tops[0];
    const middleRows = state.categories.filter((row) => row.top === top);
    const middles = unique(middleRows, "middle");
    const middle = middles.includes(state.categoryMiddle) ? state.categoryMiddle : middles[0];
    const leaves = middleRows.filter((row) => row.middle === middle).sort((a, b) => a.leaf.localeCompare(b.leaf, "zh-CN"));
    state.categoryTop = top;
    state.categoryMiddle = middle;
    const column = (title, values, selected, attr) => `<section class="pricing-category-column"><h3>${title}</h3>${values.map((value) => `<button class="pricing-category-option${value === selected ? " active" : ""}" type="button" ${attr}="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("")}</section>`;
    host.innerHTML = `${column(`一级类目（${tops.length}）`, tops, top, "data-top")}${column(`具体类目（${middles.length}）`, middles, middle, "data-middle")}<section class="pricing-category-column"><h3>选择商品类目（${leaves.length}）</h3>${leaves.map((row) => `<button class="pricing-category-option${row.id === state.selectedCategoryId ? " active" : ""}" type="button" data-leaf="${escapeHtml(row.id)}">${escapeHtml(row.leaf)}</button>`).join("")}</section>`;
  }

  function renderMobileCategoryPicker() {
    const dialog = $("pricingCalcCategoryMobileDialog");
    if (dialog.hidden) return;
    const rows = state.categories;
    const list = $("pricingCalcCategoryMobileList");
    const draft = rows.find((row) => row.id === state.mobileDraftId);
    const search = state.mobileSearch.trim().toLocaleLowerCase();
    $("pricingCalcCategoryMobileSearch").value = state.mobileSearch;
    $("pricingCalcCategoryMobileConfirm").hidden = !draft;
    $("pricingCalcCategoryMobileConfirm").innerHTML = draft ? `<span><strong>${escapeHtml(draft.leaf)}</strong>${escapeHtml(draft.top)} / ${escapeHtml(draft.middle)}</span><button type="button" data-confirm>使用此类目</button>` : "";
    const option = (label, detail, attr, value, active = false, leaf = false) => `<button class="pricing-category-mobile-option${active ? " active" : ""}" type="button" ${attr}="${escapeHtml(value)}"><span>${escapeHtml(label)}${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span><b>${leaf && active ? "✓" : "›"}</b></button>`;
    if (search) {
      const matches = rows.filter((row) => categoryPath(row).toLocaleLowerCase().includes(search)).slice(0, 80);
      $("pricingCalcCategoryMobileCrumb").textContent = `搜索结果 · ${matches.length}${matches.length === 80 ? "+" : ""}`;
      $("pricingCalcCategoryMobileBack").hidden = false;
      list.innerHTML = `<p class="pricing-category-mobile-section-title">匹配的最终类目</p>${matches.map((row) => option(row.leaf, `${row.top} / ${row.middle}`, "data-mobile-leaf", row.id, draft?.id === row.id, true)).join("") || '<div class="pricing-category-mobile-empty">没有找到相近类目，请换个词试试。</div>'}`;
      return;
    }
    const tops = unique(rows, "top");
    if (state.mobileStep === "top") {
      $("pricingCalcCategoryMobileCrumb").textContent = `一级类目 · ${tops.length} 项`;
      $("pricingCalcCategoryMobileBack").hidden = true;
      let recents = [];
      try { recents = JSON.parse(localStorage.getItem("ozon_pricing_category_recents_v1") || "[]").map((id) => rows.find((row) => row.id === id)).filter(Boolean); } catch {}
      list.innerHTML = `${recents.length ? `<p class="pricing-category-mobile-section-title">最近使用</p>${recents.map((row) => option(row.leaf, `${row.top} / ${row.middle}`, "data-mobile-leaf", row.id, false, true)).join("")}` : ""}<p class="pricing-category-mobile-section-title">请选择一级类目</p>${tops.map((value) => option(value, "", "data-mobile-top", value)).join("")}`;
      return;
    }
    if (state.mobileStep === "middle") {
      const middles = unique(rows.filter((row) => row.top === state.mobileTop), "middle");
      $("pricingCalcCategoryMobileCrumb").textContent = `${state.mobileTop} · 具体类目`;
      $("pricingCalcCategoryMobileBack").hidden = false;
      list.innerHTML = `<p class="pricing-category-mobile-section-title">${escapeHtml(state.mobileTop)}</p>${middles.map((value) => option(value, "", "data-mobile-middle", value)).join("")}`;
      return;
    }
    const leaves = rows.filter((row) => row.top === state.mobileTop && row.middle === state.mobileMiddle).sort((a, b) => a.leaf.localeCompare(b.leaf, "zh-CN"));
    $("pricingCalcCategoryMobileCrumb").textContent = `${state.mobileTop} / ${state.mobileMiddle}`;
    $("pricingCalcCategoryMobileBack").hidden = false;
    list.innerHTML = `<p class="pricing-category-mobile-section-title">请选择最终类目</p>${leaves.map((row) => option(row.leaf, "", "data-mobile-leaf", row.id, draft?.id === row.id, true)).join("")}`;
  }

  function selectCategory(id) {
    const row = state.categories.find((item) => item.id === id);
    if (!row) return;
    state.selectedCategoryId = row.id;
    state.categoryTop = row.top;
    state.categoryMiddle = row.middle;
    $("pricingCalcCategoryPath").value = categoryPath(row);
    $("pricingCalcCategorySearch").value = categoryPath(row);
    state.categorySearch = "";
    $("pricingCalcCategoryPicker").hidden = true;
    $("pricingCalcCategorySearch").setAttribute("aria-expanded", "false");
    $("pricingCalcCategoryMobileValue").textContent = categoryPath(row);
    $("pricingCalcCategoryMobileTrigger").classList.add("has-value");
    $("pricingCalcCategoryMobileDialog").hidden = true;
    $("pricingCalcCategoryMobileTrigger").setAttribute("aria-expanded", "false");
    document.body.classList.remove("pricing-category-mobile-open");
    try {
      const recent = JSON.parse(localStorage.getItem("ozon_pricing_category_recents_v1") || "[]");
      localStorage.setItem("ozon_pricing_category_recents_v1", JSON.stringify([id, ...recent.filter((item) => item !== id)].slice(0, 6)));
    } catch {}
    $("pricingCalcCategoryHint").textContent = `${row.top} / ${row.middle} / ${row.leaf} · 系统将按履约方式与售价档位匹配官方佣金`;
    renderCategoryPicker();
    scheduleCalculation();
  }

  function setOptions(select, values, preferred) {
    select.replaceChildren(...values.map(({ value, label }) => new Option(label, value)));
    select.value = values.some(({ value }) => value === preferred) ? preferred : (values[0]?.value || "");
    select.disabled = !values.length;
    return select.value;
  }
  function syncLogistics(changed = "") {
    const rows = state.logistics?.records || [];
    const country = $("pricingCalcCountry").value;
    const countryRows = rows.filter((row) => row.country === country);
    const fs = [...new Set(countryRows.map((row) => row.fulfillment))];
    const fulfillment = setOptions($("pricingCalcFulfillment"), ["rfbs", "fbp"].filter((x) => fs.includes(x)).map((value) => ({ value, label: value === "fbp" ? "FBP" : "rFBS" })), changed === "pricingCalcCountry" ? "rfbs" : $("pricingCalcFulfillment").value);
    const scoped = countryRows.filter((row) => row.fulfillment === fulfillment);
    const providers = [...new Map(scoped.map((row) => [row.providerKey, row.providerLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN")).map(([value, label]) => ({ value, label }));
    const provider = setOptions($("pricingCalcProvider"), providers, ["pricingCalcCountry", "pricingCalcFulfillment"].includes(changed) ? "" : $("pricingCalcProvider").value);
    const available = new Set(scoped.filter((row) => row.providerKey === provider).map((row) => row.channel));
    setOptions($("pricingCalcChannel"), ["express", "standard", "economy"].filter((value) => available.has(value)).map((value) => ({ value, label: value === "express" ? "Express 快速" : value === "standard" ? "Standard 标准" : "Economy 经济" })), ["pricingCalcCountry", "pricingCalcFulfillment", "pricingCalcProvider"].includes(changed) ? "standard" : $("pricingCalcChannel").value);
    const countryLabel = state.logistics?.countries?.find((row) => row.key === country)?.label || country;
    const providerLabel = providers.find((row) => row.value === provider)?.label || provider;
    $("pricingCalcLogisticsStatus").textContent = provider && $("pricingCalcChannel").value ? `${countryLabel} · ${fulfillment === "fbp" ? "FBP" : "rFBS"} · ${providerLabel} · 系统将按售价、重量和尺寸自动匹配包裹类型` : `${countryLabel}当前没有可用物流方案`;
  }

  const fieldHelp = {
    category: "定价产品所属的类目，将决定您定价产品的佣金比例。", "purchase-cost": "商品从供应商采购的实际成本，不含国内运费、跨境物流费和平台费用。注意，单位为人民币元。", "expected-profit": "除去所有成本后，希望获得的利润。可选择按利润率或固定利润金额反推售价。", "package-weight": "商品打包后快递发出的实际重量，运费将按照包裹重量进行收取。注意，单位为克。", "package-volume": "商品打包后的长、宽、高尺寸，用于自动匹配物流类型及计算体积重。注意，单位为厘米。", "destination-country": "选择商品最终配送的国家。系统会据此筛选可用履约方式、物流商、渠道、售价范围和资费。", "logistics-provider": "选择实际使用的跨境物流服务商，系统会按照对应服务商的报价计算跨境物流费。", "logistics-channel": "选择跨境物流渠道。Express、Standard、Economy 的费用和预计时效不同。", fulfillment: "选择 Ozon 履约方式。FBP 模式的类目佣金率比 rFBS 模式少 1 个百分点。", "domestic-cost": "商品运送到 Ozon 转运仓库的运费，以及代贴面单等国内段服务费用。", "advertising-rate": "计划给该商品投放广告的广告费比例，可根据搜索广告比例与展示广告比例填写。", "other-cost": "商品销售中除已列项目外的成本比例，如回款手续费、提现手续费、货损等，按售价比例计算。", "exchange-rate": "人民币换算为卢布的汇率。例如填 12.5，表示 ¥1 = ₽12.5；可按实际结算汇率手动填写。", "detail-purchase-cost": "您填写的商品采购成本，按人民币计入商品成本。", "detail-domestic-cost": "商品发往国内集货仓的运费，以及代贴面单等国内段服务费用，按人民币计入商品成本。", "detail-other-cost": "根据您填写的其他成本比例，按应售价格计算，包括回款手续费、提现手续费、货损等未单独列出的成本。", "detail-cross-border-logistics": "根据所选物流商、物流渠道、履约方式、售价、重量和包裹尺寸自动匹配物流类型，并按仓库内标注日期的物流费率估算。", "detail-last-mile": "尾程派送费按售价的 2% 计算，每个货件最低 ₽15、最高 ₽200，并已计入应售价格。", "detail-commission": "根据所选商品类目、应售价格所在档位和履约方式，按照仓库内标注日期的 Ozon 佣金快照估算。", "detail-advertising": "根据您填写的广告费占比，按应售价格计算并计入平台费用。"
  };
  function setupHelp() {
    let tip;
    const close = () => { if (tip) tip.hidden = true; document.querySelectorAll(".pricing-help-trigger[aria-expanded=true]").forEach((button) => button.setAttribute("aria-expanded", "false")); };
    const open = (button) => {
      const text = fieldHelp[button.dataset.pricingHelp];
      if (!text) return;
      close();
      if (!tip) { tip = document.createElement("div"); tip.id = "pricingCalcFieldHelpPopover"; tip.className = "pricing-help-popover"; tip.setAttribute("role", "tooltip"); document.body.append(tip); }
      tip.textContent = text; tip.hidden = false; button.setAttribute("aria-expanded", "true");
      const rect = button.getBoundingClientRect();
      tip.style.left = `${Math.min(innerWidth - 300, Math.max(12, rect.left))}px`;
      tip.style.top = `${Math.min(innerHeight - 130, rect.bottom + 8)}px`;
    };
    document.addEventListener("click", (event) => { const button = event.target.closest(".pricing-help-trigger"); if (button) { event.preventDefault(); open(button); } else if (!event.target.closest(".pricing-help-popover")) close(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  }

  function detailRow(label, value, help) {
    return `<div class="pricing-calc-detail-row"><span>${escapeHtml(label)} <button class="pricing-help-trigger pricing-detail-help-trigger" type="button" data-pricing-help="${help}" aria-label="查看${escapeHtml(label)}说明" aria-expanded="false">?</button></span><strong>${value}</strong></div>`;
  }
  function renderResult(payload) {
    const quote = payload.recommended;
    const input = {
      country: $("pricingCalcCountry").value, fulfillment: $("pricingCalcFulfillment").value, provider: $("pricingCalcProvider").value, channel: $("pricingCalcChannel").value,
      costCny: number("pricingCalcCostCny"), fx: number("pricingCalcFx"), profitMode: $("pricingCalcProfitMode").value,
      targetProfitCny: $("pricingCalcProfitMode").value === "fixed" ? number("pricingCalcTargetProfit") : 0,
      targetMargin: $("pricingCalcProfitMode").value === "margin" ? number("pricingCalcTargetProfit") / 100 : 0,
      domesticCost: number("pricingCalcDomesticCost"), otherCostRate: number("pricingCalcOtherCost") / 100, promoRate: number("pricingCalcPromoRate") / 100,
      commissionRate: quote.fees.commissionRate
    };
    const groupNames = { extraSmall: "Extra Small", budget: "Budget", small: "Small", big: "Big", premiumSmall: "Premium Small", premiumBig: "Premium Big" };
    const map = (item) => ({ input: { ...input, channel: item.logistics.channel }, channel: { label: item.logistics.channel === "express" ? "Express" : item.logistics.channel === "standard" ? "Standard" : "Economy", days: item.logistics.days }, logistics: item.logistics, group: { label: groupNames[item.logistics.group] || item.logistics.group }, saleCny: item.saleCny, saleRub: item.saleRub, profitCny: item.profitCny, margin: item.margin, logisticsCny: item.fees.logisticsCny, lastMileCny: item.fees.lastMileCny, lastMileRub: item.fees.lastMileRub, commissionCny: item.fees.commissionCny, promoCny: item.fees.advertisingCny, otherCny: item.fees.otherCostCny });
    const result = map(quote);
    const channelQuotes = (payload.channelQuotes || []).map(map);
    const shownProfit = input.profitMode === "fixed" ? input.targetProfitCny : result.profitCny;
    const shownMargin = result.saleCny > 0 ? shownProfit / result.saleCny : 0;
    const target = input.profitMode === "fixed" ? `期望利润 ${moneyCny(input.targetProfitCny)}` : `期望利润率 ${(input.targetMargin * 100).toFixed(1)}%`;
    const rateLabel = (value) => `${Number((Number(value || 0) * 100).toFixed(2)).toLocaleString("zh-CN")}%`;
    const sourceKey = input.fulfillment === "fbp" ? "fbp" : input.country === "ru" ? "rfbs-ru" : "rfbs-cis";
    const sourceOrder = ["commission", "rfbs-ru", "fbp", "rfbs-cis"];
    const sourceMarkup = sourceOrder.map((key) => state.logistics?.sources?.find((source) => source.key === key)).filter(Boolean).map((source) => `<div class="pricing-calc-source-item ${source.key === sourceKey ? "current-source" : ""}"><span>${source.key === "commission" ? "佣金费率" : "物流资费"}</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(source.label)}</strong><span aria-hidden="true">↗</span></a><small>${escapeHtml(source.version)} · 更新于 ${escapeHtml(source.updatedAt)}${source.key === sourceKey ? " · 当前采用" : ""}</small></div>`).join("");
    $("resultPanel").innerHTML = `
      <section class="panel pricing-calc-result-card"><div class="pricing-calc-card-title"><span></span><h2>计算结果</h2></div><div class="pricing-calc-result-pair"><div class="pricing-calc-primary-metric"><span>售价</span><strong class="${shownProfit >= 0 ? "positive" : "negative"}">${moneyCny(result.saleRub / input.fx)}</strong><small>≈ ${moneyRub(result.saleRub)}</small></div><div class="pricing-calc-secondary-metric"><span>利润</span><strong>${moneyCny(shownProfit)}</strong><small>利润率 ${(shownMargin * 100).toFixed(1)}%</small></div></div><p class="pricing-calc-rate-line">${target} · 当前汇率：¥1 = ₽${input.fx.toFixed(4)}</p></section>
      <section class="panel pricing-calc-logistics-card"><div class="pricing-calc-card-title"><span></span><h2>物流费用</h2></div><p class="pricing-calc-match-note">系统已按售价、重量和体积自动匹配 ${escapeHtml(result.group.label)}，下方费用均按该类型计算。</p><div class="pricing-calc-shipping-options">${channelQuotes.map((item) => `<button class="pricing-calc-shipping-option${item.input.channel === input.channel ? " active" : ""}" type="button" data-channel="${escapeHtml(item.input.channel)}">${item.input.channel === input.channel ? "<b>当前所选</b>" : ""}<span>${escapeHtml(item.channel.label)}</span><em>${escapeHtml(item.group.label)}</em><strong>${moneyCny(item.logisticsCny)}</strong><small>${escapeHtml(item.channel.days || "")}</small></button>`).join("")}</div></section>
      <section class="panel pricing-calc-detail-card"><div class="pricing-calc-card-title"><span></span><h2>计算明细</h2></div><div class="pricing-calc-detail-list"><section class="pricing-calc-detail-group"><h3>商品成本</h3>${detailRow("采购成本", moneyCny(input.costCny), "detail-purchase-cost")}${detailRow("国内运费+代贴单", moneyCny(input.domesticCost), "detail-domestic-cost")}${detailRow(`其他成本 ${rateLabel(input.otherCostRate)}`, moneyCny(result.otherCny), "detail-other-cost")}</section><section class="pricing-calc-detail-group"><h3>平台费用</h3>${detailRow("跨境物流费", moneyCny(result.logisticsCny), "detail-cross-border-logistics")}${detailRow("尾程派送费 2%", `${moneyCny(result.lastMileCny)}（${moneyRub(result.lastMileRub)}）`, "detail-last-mile")}${detailRow(`平台佣金 ${rateLabel(result.input.commissionRate)}`, moneyCny(result.commissionCny), "detail-commission")}${detailRow(`广告费 ${rateLabel(input.promoRate)}`, moneyCny(result.promoCny), "detail-advertising")}</section></div><div class="pricing-calc-source-note"><div class="pricing-calc-source-header"><div><strong>官方数据来源</strong><small>佣金与物流资费依据</small></div><a class="pricing-calc-official-link" href="https://global-help.ozon.com/zh/" target="_blank" rel="noopener noreferrer">Ozon 官方资料 <span aria-hidden="true">↗</span></a></div><div class="pricing-calc-source-grid">${sourceMarkup}</div></div></section>`;
  }

  function payload() {
    const profitMode = $("pricingCalcProfitMode").value;
    return {
      categoryId: state.selectedCategoryId, country: $("pricingCalcCountry").value, fulfillment: $("pricingCalcFulfillment").value,
      provider: $("pricingCalcProvider").value, channel: $("pricingCalcChannel").value,
      costCny: number("pricingCalcCostCny"), fx: number("pricingCalcFx"), weightG: number("pricingCalcWeightG"),
      lengthCm: number("pricingCalcLengthCm"), widthCm: number("pricingCalcWidthCm"), heightCm: number("pricingCalcHeightCm"),
      profitMode, targetProfit: number("pricingCalcTargetProfit"), domesticCost: number("pricingCalcDomesticCost"),
      promoRate: number("pricingCalcPromoRate"), otherCostRate: number("pricingCalcOtherCost")
    };
  }
  function showError(error) {
    const logisticsError = ["SIZE_LIMIT", "SIZE_LIMIT_EXCEEDED", "WEIGHT_LIMIT_EXCEEDED", "SALE_LIMIT_EXCEEDED", "NO_FEASIBLE_SERVICE", "CHANNEL_UNAVAILABLE", "ROUTE_UNAVAILABLE"].includes(error.code);
    const dimensionMessage = logisticsError ? error.message || "请调整包裹尺寸、重量或物流渠道。" : "";
    $("pricingCalcDimensionError").hidden = !dimensionMessage;
    $("pricingCalcDimensionError").textContent = dimensionMessage;
    ["pricingCalcLengthCm", "pricingCalcWidthCm", "pricingCalcHeightCm"].forEach((id) => $(id).classList.toggle("input-error", Boolean(dimensionMessage)));
    $("resultPanel").innerHTML = `<section class="panel pricing-calc-detail-card" role="alert"><strong>${logisticsError ? "当前包裹不符合物流限制" : "暂时无法反推出应售价格"}</strong><p>${escapeHtml(error.message || "请检查输入内容后重试。")}</p></section>`;
  }

  const numericRules = [
    ["pricingCalcCostCny", "采购成本", .01, 1000000, 2], ["pricingCalcTargetProfit", "期望利润", 0, 1000000, 2],
    ["pricingCalcWeightG", "包裹重量", 1, 30000, 0], ["pricingCalcLengthCm", "包裹长度", .1, 1000, 1],
    ["pricingCalcWidthCm", "包裹宽度", .1, 1000, 1], ["pricingCalcHeightCm", "包裹高度", .1, 1000, 1],
    ["pricingCalcDomesticCost", "国内运费+代贴单", 0, 1000000, 2], ["pricingCalcPromoRate", "广告费占比", 0, 80, 2],
    ["pricingCalcOtherCost", "其他成本", 0, 80, 2], ["pricingCalcFx", "汇率", .0001, 1000, 4]
  ];
  function validateInputs() {
    const errors = [];
    for (const [id, label, min, max, digits] of numericRules) {
      const input = $(id);
      const raw = input.value.trim();
      const value = Number(raw);
      let message = "";
      if (!raw || !Number.isFinite(value)) message = `${label}必须填写有效数字`;
      else if (value < min) message = min > 0 ? `${label}必须大于 0` : `${label}不能为负数`;
      else if (value > max) message = `${label}超出允许范围（最大 ${max}）`;
      else if (digits === 0 && !Number.isInteger(value)) message = `${label}必须填写整数`;
      else if (digits > 0 && (raw.split(".")[1] || "").length > digits) message = `${label}最多保留 ${digits} 位小数`;
      else if (id === "pricingCalcTargetProfit" && $("pricingCalcProfitMode").value === "margin" && value > 80) message = "期望利润百分比不得超过 80%";
      input.classList.toggle("input-error", Boolean(message));
      input.setAttribute("aria-invalid", message ? "true" : "false");
      if (message) errors.push(message);
    }
    if (!errors.length && number("pricingCalcPromoRate") + number("pricingCalcOtherCost") >= 90) {
      errors.push("广告费占比与其他成本合计必须低于 90%");
      ["pricingCalcPromoRate", "pricingCalcOtherCost"].forEach((id) => {
        $(id).classList.add("input-error");
        $(id).setAttribute("aria-invalid", "true");
      });
    }
    $("pricingCalcInputError").hidden = !errors.length;
    $("pricingCalcInputError").textContent = errors.join("；");
    return errors;
  }

  function normalizeNumericInput(input, { finalize = false } = {}) {
    if (!input || !numericRules.some(([id]) => id === input.id)) return;
    const raw = String(input.value || "").trim();
    if (!raw) return;
    if (/[eE+\-]/.test(raw)) {
      input.value = "";
      return;
    }
    const withoutLeadingZeros = raw.replace(/^0+(?=\d)/, "");
    if (withoutLeadingZeros !== raw) input.value = withoutLeadingZeros;
    if (finalize && input.value && Number.isFinite(Number(input.value))) input.value = String(Number(input.value));
  }

  function scheduleCalculation() {
    if (state.calculationTimer) clearTimeout(state.calculationTimer);
    const category = selectedCategory();
    const errors = validateInputs();
    if (!category) {
      state.calculationResultKey = "";
      $("resultPanel").innerHTML = '<section class="panel pricing-calc-detail-card"><strong>先选择商品类目</strong><p>选好类目并填完成本后，系统会直接反推出应售价格。</p></section>';
      return;
    }
    if (errors.length) {
      state.calculationResultKey = "";
      $("resultPanel").innerHTML = `<section class="panel pricing-calc-detail-card" role="alert"><strong>请先修正输入数据</strong><p>${escapeHtml(errors.join("；"))}。</p></section>`;
      return;
    }
    const key = JSON.stringify(payload());
    if (state.calculationResultKey === key) return;
    if (state.calculationsInFlight.has(key)) {
      $("resultPanel").innerHTML = '<div class="empty"><strong>正在计算应售价格</strong><p>正在校验佣金、物流限制与目标利润。</p></div>';
      return;
    }
    state.calculationResultKey = "";
    $("resultPanel").innerHTML = '<div class="empty"><strong>正在计算应售价格</strong><p>正在校验佣金、物流限制与目标利润。</p></div>';
    state.calculationTimer = setTimeout(() => {
      state.calculationTimer = null;
      calculate();
    }, 220);
  }

  function calculationStillMatches(key) {
    return Boolean(selectedCategory()) && validateInputs().length === 0 && JSON.stringify(payload()) === key;
  }

  async function calculate() {
    if (state.calculationTimer) {
      clearTimeout(state.calculationTimer);
      state.calculationTimer = null;
    }
    const category = selectedCategory();
    if (!category) { $("resultPanel").innerHTML = '<section class="panel pricing-calc-detail-card"><strong>先选择商品类目</strong><p>选好类目并填完成本后，系统会直接反推出应售价格。</p></section>'; return; }
    if (validateInputs().length) { $("resultPanel").innerHTML = '<section class="panel pricing-calc-detail-card"><strong>请先修正输入数据</strong><p>请检查表单中标出的内容。</p></section>'; return; }
    const requestPayload = payload();
    const requestKey = JSON.stringify(requestPayload);
    if (state.calculationResultKey === requestKey || state.calculationsInFlight.has(requestKey)) return;
    state.calculationsInFlight.add(requestKey);
    $("resultPanel").innerHTML = '<div class="empty"><strong>正在计算应售价格</strong><p>正在校验佣金、物流限制与目标利润。</p></div>';
    try {
      const result = await request("calculate", { method: "POST", body: JSON.stringify(requestPayload) });
      if (!calculationStillMatches(requestKey)) return;
      renderResult(result);
      state.calculationResultKey = requestKey;
    } catch (error) {
      if (calculationStillMatches(requestKey)) showError(error);
    } finally {
      state.calculationsInFlight.delete(requestKey);
    }
  }

  async function init() {
    setupHelp();
    try {
      const [commission, logistics, rate] = await Promise.all([
        request("catalog/commission"), request("catalog/logistics"), request("exchange-rate")
      ]);
      state.categories = commission.rows || [];
      state.logistics = logistics;
      state.sources = logistics.sources || [];
      state.exchangeRate = rate;
      if (!$("pricingCalcFx").dataset.userEdited) $("pricingCalcFx").value = Number(rate.rate).toFixed(4);
      $("pricingCalcFxMeta").textContent = `参考：${rate.source} · ${rate.quoteDate}`;
      $("pricingCalcLogisticsStatus").textContent = "";
      syncLogistics();
      renderCategoryPicker();
    } catch (error) {
      $("pricingCalcCategoryColumns").innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      $("pricingCalcLogisticsStatus").textContent = "官方物流服务列表暂时无法加载，请刷新页面重试。";
    }
  }

  $("pricingCalcCategorySearch").addEventListener("focus", () => {
    if (matchMedia("(max-width: 760px)").matches) { $("pricingCalcCategoryMobileTrigger").click(); return; }
    $("pricingCalcCategoryPicker").hidden = false;
    $("pricingCalcCategorySearch").setAttribute("aria-expanded", "true");
    if (selectedCategory() && !state.categorySearch) $("pricingCalcCategorySearch").value = "";
  });
  $("pricingCalcCategorySearch").addEventListener("input", (event) => { state.categorySearch = event.target.value; $("pricingCalcCategoryPicker").hidden = false; renderCategoryPicker(); });
  $("pricingCalcCategoryColumns").addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.top) { state.categoryTop = button.dataset.top; state.categoryMiddle = ""; renderCategoryPicker(); }
    else if (button.dataset.middle) { state.categoryMiddle = button.dataset.middle; renderCategoryPicker(); }
    else if (button.dataset.leaf) selectCategory(button.dataset.leaf);
  });
  $("pricingCalcCategorySearch").addEventListener("keydown", (event) => { if (event.key === "Escape") { $("pricingCalcCategoryPicker").hidden = true; event.currentTarget.setAttribute("aria-expanded", "false"); event.currentTarget.value = categoryPath(selectedCategory()); state.categorySearch = ""; } });
  $("pricingCalcCategoryMobileTrigger").addEventListener("click", () => { state.mobileStep = "top"; state.mobileSearch = ""; state.mobileDraftId = ""; state.mobileTop = ""; state.mobileMiddle = ""; $("pricingCalcCategoryMobileDialog").hidden = false; $("pricingCalcCategoryMobileTrigger").setAttribute("aria-expanded", "true"); document.body.classList.add("pricing-category-mobile-open"); renderMobileCategoryPicker(); });
  const closeMobileCategoryPicker = () => { $("pricingCalcCategoryMobileDialog").hidden = true; $("pricingCalcCategoryMobileTrigger").setAttribute("aria-expanded", "false"); document.body.classList.remove("pricing-category-mobile-open"); };
  $("pricingCalcCategoryMobileClose").addEventListener("click", closeMobileCategoryPicker);
  $("pricingCalcCategoryMobileBack").addEventListener("click", () => { if (state.mobileSearch) state.mobileSearch = ""; else state.mobileStep = state.mobileStep === "leaf" ? "middle" : "top"; renderMobileCategoryPicker(); });
  $("pricingCalcCategoryMobileSearch").addEventListener("input", (event) => { state.mobileSearch = event.target.value; renderMobileCategoryPicker(); });
  $("pricingCalcCategoryMobileList").addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.mobileTop) { state.mobileTop = button.dataset.mobileTop; state.mobileMiddle = ""; state.mobileStep = "middle"; }
    else if (button.dataset.mobileMiddle) { state.mobileMiddle = button.dataset.mobileMiddle; state.mobileStep = "leaf"; }
    else if (button.dataset.mobileLeaf) state.mobileDraftId = button.dataset.mobileLeaf;
    renderMobileCategoryPicker();
  });
  $("pricingCalcCategoryMobileConfirm").addEventListener("click", (event) => { if (event.target.closest("[data-confirm]")) selectCategory(state.mobileDraftId); });
  $("pricingCalcCategoryMobileDialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeMobileCategoryPicker(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("pricingCalcCategoryMobileDialog").hidden) closeMobileCategoryPicker(); });
  $("publicPricingForm").addEventListener("submit", (event) => { event.preventDefault(); calculate(); });
  $("publicPricingForm").addEventListener("input", (event) => {
    if (event.target.id === "pricingCalcCategorySearch") return;
    normalizeNumericInput(event.target);
    if (event.target.id === "pricingCalcFx") event.target.dataset.userEdited = "true";
    scheduleCalculation();
  });
  $("pricingCalcProfitMode").addEventListener("change", () => {
    const fixed = $("pricingCalcProfitMode").value === "fixed";
    $("pricingCalcProfitUnit").textContent = fixed ? "元" : "%";
    $("pricingCalcTargetProfit").max = fixed ? "1000000" : "80";
    scheduleCalculation();
  });
  $("publicPricingForm").addEventListener("keydown", (event) => { if (numericRules.some(([id]) => id === event.target.id) && ["e", "E", "+", "-"].includes(event.key)) event.preventDefault(); });
  $("publicPricingForm").addEventListener("focusout", (event) => {
    if (!numericRules.some(([id]) => id === event.target.id)) return;
    normalizeNumericInput(event.target, { finalize: true });
    scheduleCalculation();
  });
  ["pricingCalcCountry", "pricingCalcFulfillment", "pricingCalcProvider"].forEach((id) => $(id).addEventListener("change", () => { syncLogistics(id); scheduleCalculation(); }));
  $("pricingCalcChannel").addEventListener("change", scheduleCalculation);
  $("resultPanel").addEventListener("click", (event) => { const option = event.target.closest("[data-channel]"); if (option) { $("pricingCalcChannel").value = option.dataset.channel; calculate(); } });
  init();
})();
