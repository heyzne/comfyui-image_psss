/**
 * ComfyUI Multi Image Loader - 完全自定义 UI
 * 每个 image_N 渲染为：[模式切换 ▼] [对应输入控件] [预览]
 * 底部统一批量上传按钮，支持一次选择多张图片
 */
import { app } from "/scripts/app.js";

var TARGETS = ["MultiImageLoader", "MultiImageLoaderEx"];
console.log("[MultiImageLoader] JS loading...");

// CSS 注入
(function injectCSS() {
    var style = document.createElement("style");
    style.textContent = [
        ".mil-row { display:flex; align-items:center; gap:4px; margin-bottom:3px; padding:3px 6px; background:#1e1e1e; border-radius:4px; border:1px solid #333; }",
        ".mil-mode { flex-shrink:0; width:58px; height:26px; font-size:11px; background:#2a2a2a; color:#ccc; border:1px solid #444; border-radius:3px; cursor:pointer; padding:0 4px; }",
        ".mil-mode:hover { border-color:#6af; color:#fff; }",
        ".mil-input-wrap { flex:1; display:flex; align-items:center; min-width:0; position:relative; }",
        ".mil-input-wrap input, .mil-input-wrap select { width:100%; height:26px; font-size:12px; background:#222; color:#ddd; border:1px solid #444; border-radius:3px; padding:0 8px; box-sizing:border-box; }",
        ".mil-input-wrap input:focus, .mil-input-wrap select:focus { outline:none; border-color:#6af; box-shadow:0 0 4px rgba(100,170,255,.3); }",
        ".mil-url-input::placeholder { color:#558; font-style:italic; }",
        ".mil-upload-btn { flex-shrink:0; height:26px; padding:0 10px; font-size:11px; background:#2a5298; color:#fff; border:1px solid #4682b4; border-radius:3px; cursor:pointer; white-space:nowrap; }",
        ".mil-upload-btn:hover { background:#3568b0; }",
        ".mil-preview { display:none; margin-top:2px; text-align:center; }",
        ".mil-preview img { max-width:100%; max-height:60px; object-fit:contain; border-radius:3px; border:1px solid #444; }",
        ".mil-preview span { display:block; font-size:9px; color:#888; margin-top:1px; }",
        ".mil-batch-bar { display:flex; align-items:center; gap:6px; margin-top:6px; padding:6px 8px; background:#252525; border:1px dashed #555; border-radius:4px; }",
        ".mil-batch-btn { flex:1; height:30px; font-size:12px; font-weight:bold; background:#1a5c32; color:#fff; border:1px solid #2d8c4a; border-radius:4px; cursor:pointer; }",
        ".mil-batch-btn:hover { background:#207a40; }",
        ".mil-batch-info { font-size:11px; color:#aaa; white-space:nowrap; }",
        ".mil-hidden { display:none !important; }",
    ].join("\n");
    document.head.appendChild(style);
})();

app.registerExtension({
    name: "ComfyUI.MultiImageLoader",

    beforeRegisterNodeDef: function (nodeType, nodeData) {
        if (TARGETS.indexOf(nodeData.name) === -1) return;
        console.log("[MultiImageLoader] register:", nodeData.name);

        var origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (origCreated) origCreated.apply(this, arguments);
            buildCustomUI(this);
        };

        var origConf = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            if (origConf) origConf.apply(this, arguments);
            if (!this.__milBuilt) buildCustomUI(this);
            else restoreWidgetValues(this, info);
        };
    },

    loadedGraphNode: function (node) {
        if (TARGETS.indexOf(node.comfyClass) === -1) return;
        if (!node.__milBuilt) setTimeout(function () { buildCustomUI(node); }, 300);
    },
});

// ========== 构建 UI ==========
function buildCustomUI(node) {
    if (node.__milBuilt || !node.widgets) return;
    node.__milBuilt = true;

    // 收集所有 image_* 和 url_* widget
    var slots = [];
    for (var i = 0; i < node.widgets.length; i++) {
        var w = node.widgets[i];
        // image_1, image_2 ...
        if (/^image_(\d+)$/.test(w.name)) {
            var idx = parseInt(RegExp.$1);
            while (slots.length < idx) slots.push(null); // 稀疏数组保护
            slots[idx - 1] = { imgW: w, urlW: null };
        }
        // url_1, url_2 ...
        else if (/^url_(\d+)$/.test(w.name)) {
            var idx = parseInt(RegExp.$1);
            if (slots[idx - 1]) slots[idx - 1].urlW = w;
        }
    }
    // 过滤空位
    slots = slots.filter(function (s) { return s && s.imgW; });
    if (slots.length === 0) return;

    console.log("[MultiImageLoader] building UI for", slots.length, "slots");

    // ---- 创建容器 ----
    var container = document.createElement("div");
    container.className = "mil-container";
    container.style.cssText = "margin-top:4px;";

    // ---- 为每个 slot 创建一行控件 ----
    for (var s = 0; s < slots.length; s++) {
        (function (slotIdx, slot) {
            var row = createSlotRow(node, slotIdx + 1, slot.imgW, slot.urlW);
            container.appendChild(row);
        })(s, slots[s]);
    }

    // ---- 批量上传栏 ----
    var batchBar = createBatchBar(node, slots);
    container.appendChild(batchBar);

    // ---- 插入到节点 ----
    insertContainer(node, container);

    // ---- 隐藏原始 widget 的 element ----
    hideOriginalWidgets(slots);

    console.log("[MultiImageLoader] built", slots.length, "slot rows + batch upload");
}

// ---------- 单行控件 ----------
function createSlotRow(node, idx, imgW, urlW) {
    var row = document.createElement("div");
    row.className = "mil-row";

    // 模式选择器
    var modeSel = document.createElement("select");
    modeSel.className = "mil-mode";
    modeSel.innerHTML = "<option value='file'>📁 File</option><option value='url'>🔗 URL</option>";
    // 自动检测当前值决定默认模式
    var curUrl = String(urlW.value || "").trim();
    modeSel.value = (curUrl && curUrl.startsWith("http")) ? "url" : "file";

    // --- File 模式内容 ---
    var fileWrap = document.createElement("div");
    fileWrap.className = "mil-input-wrap mil-file-wrap";

    // 复制 combo 的选项
    var fileSel = document.createElement("select");
    fileSel.className = "mil-file-sel";
    fillComboOptions(fileSel, imgW);
    // 设置当前值
    fileSel.value = imgW.value || "(none)";
    fileSel.addEventListener("change", function () {
        imgW.value = fileSel.value;
        updatePreview(idx, imgW.value, null, previewArea);
        if (imgW.callback) imgW.callback(fileSel.value);
    });

    // 单独的上传按钮
    var upBtn = document.createElement("button");
    upBtn.className = "mil-upload-btn";
    upBtn.textContent = "↑";
    upBtn.title = "上传图片到此位置";
    upBtn.addEventListener("click", function () {
        triggerSingleUpload(node, idx, imgW, fileSel, previewArea);
    });

    fileWrap.appendChild(fileSel);
    fileWrap.appendChild(upBtn);

    // --- URL 模式内容 ---
    var urlWrap = document.createElement("div");
    urlWrap.className = "mil-input-wrap mil-url-wrap";

    var urlInput = document.createElement("input");
    urlInput.className = "mil-url-input";
    urlInput.type = "text";
    urlInput.placeholder = "https://... 或粘贴图片地址";
    urlInput.value = curUrl;
    urlInput.addEventListener("input", function () {
        urlW.value = urlInput.value;
        if (urlW.callback) urlW.callback(urlInput.value);
    });
    urlInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { urlW.value = urlInput.value; if (urlW.callback) urlW.callback(urlInput.value); }
    });

    urlWrap.appendChild(urlInput);

    // --- 预览区 ---
    var previewArea = document.createElement("div");
    previewArea.className = "mil-preview";
    previewArea.id = "mil-preview-" + idx;
    initPreview(idx, imgW.value, curUrl, previewArea);

    // 组装
    row.appendChild(modeSel);
    row.appendChild(fileWrap);
    row.appendChild(urlWrap);
    row.appendChild(previewArea);

    // 模式切换逻辑
    modeSel.addEventListener("change", function () {
        if (modeSel.value === "file") {
            fileWrap.style.display = "flex";
            urlWrap.style.display = "none";
        } else {
            fileWrap.style.display = "none";
            urlWrap.style.display = "flex";
        }
    });

    // 初始化显示状态
    if (modeSel.value === "url") {
        fileWrap.style.display = "none";
    } else {
        urlWrap.style.display = "none";
    }

    return row;
}

// ---------- 批量上传栏 ----------
function createBatchBar(node, slots) {
    var bar = document.createElement("div");
    bar.className = "mil-batch-bar";

    var btn = document.createElement("button");
    btn.className = "mil-batch-btn";
    btn.textContent = "📁 批量上传图片 (可多选)";
    bar.appendChild(btn);

    var info = document.createElement("span");
    info.className = "mil-batch-info";
    info.textContent = "将按顺序填入空位";
    bar.appendChild(info);

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    btn.addEventListener("click", function () { fileInput.click(); });

    fileInput.addEventListener("change", function (e) {
        var files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        // 找第一个空位起始的索引（或者从第一个位置开始）
        var startIdx = 0;
        for (var i = 0; i < slots.length; i++) {
            var sv = String(slots[i].imgW.value || "").trim();
            var uv = String(slots[i].urlW.value || "").trim();
            if ((sv === "" || sv === "(none)") && !uv.startsWith("http")) {
                startIdx = i;
                break;
            }
            if (i === slots.length - 1) startIdx = 0; // 全满则从头覆盖? 不,追加到最后一个非空之后
        }
        // 更好的策略: 从第一个空位开始填
        startIdx = 0;
        for (var k = 0; k < slots.length; k++) {
            var sv2 = String(slots[k].imgW.value || "").trim();
            var uv2 = String(slots[k].urlW.value || "").trim();
            if ((sv2 === "" || sv2 === "(none)") && !uv2.startsWith("http")) {
                startIdx = k;
                break;
            }
            startIdx = k + 1; // 如果都满了就放到最后
        }
        if (startIdx >= slots.length) startIdx = slots.length - 1; // 保护

        var uploaded = 0;
        var queue = files.slice(0, slots.length - startIdx); // 不超过剩余位数

        info.textContent = "正在上传 " + queue.length + " 张...";

        queue.forEach(function (file, qi) {
            var targetIdx = startIdx + qi;
            if (targetIdx >= slots.length) return;

            uploadFileToComfy(node, file, targetIdx).then(function (result) {
                uploaded++;
                // 更新对应的 widget 值和 UI
                var slot = slots[result.idx];
                slot.imgW.value = result.filename;
                slot.urlW.value = ""; // 清除 URL

                // 更新 UI 中的 select 和预览
                updateSlotUI(targetIdx + 1, result.filename, "");
                info.textContent = "已上传 " + uploaded + "/" + queue.length;

                if (uploaded === queue.length) {
                    setTimeout(function () { info.textContent = "✅ 完成!"; }, 1000);
                    setTimeout(function () { info.textContent = "将按顺序填入空位"; }, 3000);
                }
            }).catch(function (err) {
                console.error("[MultiImage] batch upload error:", err);
                uploaded++;
                info.textContent = "❌ 第 " + (uploaded) + " 张失败";
            });
        });

        // 清空以允许重复选择同一文件
        fileInput.value = "";
    });

    bar.appendChild(fileInput);
    return bar;
}

// ---------- 更新单个 slot 的 UI ----------
function updateSlotUI(idx, filename, urlVal) {
    var sel = document.querySelector("#mil-preview-" + idx);
    if (!sel) return;
    // 更新同行的 select 和 preview
    var row = sel.closest(".mil-row") || sel.parentElement;
    if (!row) return;

    var fileSelect = row.querySelector(".mil-file-sel");
    if (fileSelect && filename) fileSelect.value = filename;

    updatePreview(idx, filename, urlVal, sel);
}

// ---------- 预览相关 ----------
function initPreview(idx, fname, urlVal, area) {
    updatePreview(idx, fname, urlVal, area);
}

function updatePreview(idx, fname, urlVal, area) {
    fname = String(fname || "");
    urlVal = String(urlVal || "");

    var isFile = (fname && fname !== "(none)");
    var isUrl = urlVal.startsWith("http");

    if (!isFile && !isUrl) { area.style.display = "none"; return; }

    area.style.display = "block";
    area.innerHTML = "";

    if (isUrl) {
        var img = document.createElement("img");
        img.src = urlVal;
        img.alt = "URL image " + idx;
        img.onerror = function () { this.style.display = "none"; };
        area.appendChild(img);
        var sp = document.createElement("span");
        sp.textContent = "URL #" + idx;
        area.appendChild(sp);
    } else {
        // 本地文件预览 - 通过 ComfyUI 的查看 API
        var viewUrl = "/view?filename=" + encodeURIComponent(fname) + "&type=input&subfolder=";
        var img = document.createElement("img");
        img.src = viewUrl;
        img.alt = fname;
        img.onerror = function () { this.style.display = "none"; };
        area.appendChild(img);
        var sp = document.createElement("span");
        sp.textContent = fname;
        area.appendChild(sp);
    }
}

// ---------- 填充 combo 选项 ----------
function fillComboOptions(selectEl, imgWidget) {
    selectEl.innerHTML = "";
    // 从 imgWidget.options 获取
    if (imgWidget.options && imgWidget.options.values) {
        for (var j = 0; j < imgWidget.options.values.length; j++) {
            var opt = document.createElement("option");
            opt.value = imgWidget.options.values[j];
            opt.textContent = imgWidget.options.values[j];
            selectEl.appendChild(opt);
        }
    } else {
        opt = document.createElement("option");
        opt.value = "(none)";
        opt.textContent = "(none)";
        selectEl.appendChild(opt);
    }
}

// ---------- 单文件上传 ----------
function triggerSingleUpload(node, idx, imgW, selectEl, previewArea) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) { document.body.removeChild(input); return; }

        uploadFileToComfy(node, file, idx - 1).then(function (result) {
            imgW.value = result.filename;
            selectEl.value = result.filename;
            updatePreview(idx, result.filename, "", previewArea);
            document.body.removeChild(input);
        }).catch(function (err) {
            alert("上传失败: " + err);
            document.body.removeChild(input);
        });
    });

    input.click();
}

// ---------- 上传文件到 ComfyUI input 目录 ----------
function uploadFileToComfy(node, file, slotIndex) {
    return new Promise(function (resolve, reject) {
        var body = new FormData();
        body.append("image", file);
        body.append("subfolder", "");
        body.append("type", "input");

        fetch("/upload/image", {
            method: "POST",
            body: body
        }).then(function (resp) {
            return resp.json();
        }).then(function (data) {
            if (data && data.name) {
                resolve({ idx: slotIndex, filename: data.name });
            } else {
                reject(new Error(data && data.error ? data.error : "未知错误"));
            }
        }).catch(reject);
    });
}

// ---------- 隐藏原始 widget 元素 ----------
function hideOriginalWidgets(slots) {
    slots.forEach(function (slot) {
        try {
            if (slot.imgW.element) slot.imgW.element.classList.add("mil-hidden");
            if (slot.urlW.element) slot.urlW.element.classList.add("mil-hidden");
            // 也尝试隐藏 label
            if (slot.imgW.labelElement) slot.imgW.labelElement.classList.add("mil-hidden");
            if (slot.urlW.labelElement) slot.urlW.labelElement.classList.add("mil-hidden");
        } catch (e) { /* ignore */ }
    });
}

// ---------- 插入容器到节点 DOM ----------
function insertContainer(node, container) {
    // 方法1: 找到 widgetsDom
    var target = null;
    // 尝试在 node 内找合适位置
    if (node.widgetsDom && node.widgetsDom.parentNode) {
        target = node.widgetsDom.parentNode;
    } else if (node._widgetsDom && node._widgetsDom.parentNode) {
        target = node._widgetsDom.parentNode;
    } else {
        // 回退: 直接 appendChild 到 node 的 graph 层级
        target = node;
    }
    target.appendChild(container);
    node._milContainer = container;
}

// ---------- 配置恢复时刷新值 ----------
function restoreWidgetValues(node, info) {
    if (!info || !info.widgets_values) return;
    // widget values 会由 ComfyUI 自动恢复到 .value
    // 这里只需要刷新 UI 显示即可
    var container = node._milContainer;
    if (!container) return;
    // 简单起见, 延迟重新扫描并更新 select/input 值
    setTimeout(function () {
        var rows = container.querySelectorAll(".mil-row");
        rows.forEach(function (row, idx) {
            var fileSel = row.querySelector(".mil-file-sel");
            var urlInp = row.querySelector(".mil-url-input");
            var modeSel = row.querySelector(".mil-mode");

            // 找到对应的 widget
            var imgWName = "image_" + (idx + 1);
            var urlWName = "url_" + (idx + 1);
            var imgW = findWidget(node, imgWName);
            var urlW = findWidget(node, urlWName);

            if (fileSel && imgW) fileSel.value = imgW.value || "(none)";
            if (urlInp && urlW) urlInp.value = urlW.value || "";

            if (modeSel) {
                var hasUrl = urlW && String(urlW.value || "").startsWith("http");
                modeSel.value = hasUrl ? "url" : "file";
                // 触发 change 来切换显示
                var ev = new Event("change");
                modeSel.dispatchEvent(ev);
            }

            var prevArea = row.querySelector(".mil-preview");
            if (prevArea && imgW && urlW) {
                updatePreview(idx + 1, imgW.value, urlW.value, prevArea);
            }
        });
    }, 50);
}

function findWidget(node, name) {
    if (!node.widgets) return null;
    for (var i = 0; i < node.widgets.length; i++) {
        if (node.widgets[i].name === name) return node.widgets[i];
    }
    return null;
}

console.log("[MultiImageLoader] loaded OK");
