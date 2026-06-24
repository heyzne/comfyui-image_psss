"""
ComfyUI Image PSSS - 批量图片加载器
适配 ComfyUI 最新版 (v0.3.x+)
每个图片下方放置 URL 输入框，类似 prompt/negative prompt 风格
"""

import os
import io
import urllib.request
import folder_paths
import torch
import numpy as np
from PIL import Image


def _load_image_from_path(image_path):
    """从本地路径加载图片"""
    img = Image.open(image_path)
    img = img.convert("RGB")
    return torch.from_numpy(np.array(img).astype(np.float32) / 255.0).unsqueeze(0)


def _load_image_from_url(url):
    """从 URL 加载图片"""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
        img = Image.open(io.BytesIO(data)).convert("RGB")
        return torch.from_numpy(np.array(img).astype(np.float32) / 255.0).unsqueeze(0)


def _load_image_from_base64(data_uri):
    """从 base64 data URI 加载图片"""
    import base64
    if "," in data_uri:
        data_uri = data_uri.split(",", 1)[1]
    img_data = base64.b64decode(data_uri)
    img = Image.open(io.BytesIO(img_data)).convert("RGB")
    return torch.from_numpy(np.array(img).astype(np.float32) / 255.0).unsqueeze(0)


def _empty_image():
    """返回空图片张量"""
    return torch.zeros((1, 1, 1, 3), dtype=torch.float32)


class MultiImageLoader:
    """
    多图片加载器 - 5输出版本
    每个图片下方放置 URL 输入框
    """
    OUTPUT_COUNT = 5

    @classmethod
    def INPUT_TYPES(cls):
        inp = folder_paths.get_input_directory()
        files = sorted(f for f in os.listdir(inp) if os.path.isfile(os.path.join(inp, f)))
        opts = ["(none)"] + files

        required = {}

        # 每个图片：文件选择器 + URL 输入框（放在下方）
        for i in range(1, cls.OUTPUT_COUNT + 1):
            required[f"image_{i}"] = (opts, {"image_upload": True})
            required[f"url_{i}"] = ("STRING", {
                "default": "",
                "multiline": False,
                "placeholder": "粘贴图片 URL...",
            })

        return {"required": required}

    RETURN_TYPES = tuple(["IMAGE"] * OUTPUT_COUNT)
    RETURN_NAMES = tuple([f"image_{i}" for i in range(1, OUTPUT_COUNT + 1)])
    FUNCTION = "load_images"
    CATEGORY = "image"
    DESCRIPTION = "批量加载图片，每个图片下方可输入 URL"

    def load_images(self, **kwargs):
        results = []

        for i in range(1, self.OUTPUT_COUNT + 1):
            val = None

            # 优先使用 URL
            url = str(kwargs.get(f"url_{i}", "") or "").strip()
            if url and url.startswith(("http://", "https://", "data:image")):
                try:
                    if url.startswith("data:image"):
                        val = _load_image_from_base64(url)
                    else:
                        val = _load_image_from_url(url)
                except Exception as e:
                    print(f"[MultiImageLoader] URL error {i}: {e}")

            # URL 失败或未提供，尝试文件
            if val is None:
                fname = str(kwargs.get(f"image_{i}", "") or "").strip()
                if fname and fname != "(none)" and fname.strip() != "":
                    try:
                        p = folder_paths.get_annotated_filepath(fname)
                        val = _load_image_from_path(p)
                    except Exception as e:
                        print(f"[MultiImageLoader] File error {i}: {e}")

            results.append(val if val is not None else _empty_image())

        return tuple(results)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True


class MultiImageLoaderEx(MultiImageLoader):
    """
    多图片加载器 - 10输出扩展版本
    每个图片下方放置 URL 输入框
    """
    OUTPUT_COUNT = 10

    @classmethod
    def INPUT_TYPES(cls):
        inp = folder_paths.get_input_directory()
        files = sorted(f for f in os.listdir(inp) if os.path.isfile(os.path.join(inp, f)))
        opts = ["(none)"] + files

        required = {}

        for i in range(1, cls.OUTPUT_COUNT + 1):
            required[f"image_{i}"] = (opts, {"image_upload": True})
            required[f"url_{i}"] = ("STRING", {
                "default": "",
                "multiline": False,
                "placeholder": "粘贴图片 URL...",
            })

        return {"required": required}

    RETURN_TYPES = tuple(["IMAGE"] * 10)
    RETURN_NAMES = tuple([f"image_{i}" for i in range(1, 11)])


class ImageURLInput:
    """
    纯 URL 图片输入节点
    仅 URL 输入，无文件上传
    """
    OUTPUT_COUNT = 10

    @classmethod
    def INPUT_TYPES(cls):
        required = {}

        for i in range(1, cls.OUTPUT_COUNT + 1):
            required[f"url_{i}"] = ("STRING", {
                "default": "",
                "multiline": False,
                "placeholder": "粘贴图片 URL...",
            })

        return {"required": required}

    RETURN_TYPES = tuple(["IMAGE"] * OUTPUT_COUNT)
    RETURN_NAMES = tuple([f"image_{i}" for i in range(1, OUTPUT_COUNT + 1)])
    FUNCTION = "load_images"
    CATEGORY = "image"
    DESCRIPTION = "通过 URL 列表批量加载图片"

    def load_images(self, **kwargs):
        results = []

        for i in range(1, self.OUTPUT_COUNT + 1):
            val = None
            url = str(kwargs.get(f"url_{i}", "") or "").strip()

            if url and url.startswith(("http://", "https://", "data:image")):
                try:
                    if url.startswith("data:image"):
                        val = _load_image_from_base64(url)
                    else:
                        val = _load_image_from_url(url)
                except Exception as e:
                    print(f"[ImageURLInput] URL error {i}: {e}")

            results.append(val if val is not None else _empty_image())

        return tuple(results)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True


# ========== 节点注册 ==========
NODE_CLASS_MAPPINGS = {
    "MultiImageLoader": MultiImageLoader,
    "MultiImageLoaderEx": MultiImageLoaderEx,
    "ImageURLInput": ImageURLInput,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiImageLoader": "Load Image (Multi 5)",
    "MultiImageLoaderEx": "Load Image (Multi 10)",
    "ImageURLInput": "Load Image from URLs",
}
