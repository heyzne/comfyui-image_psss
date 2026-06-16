"""
ComfyUI Multi Image Loader Plugin
支持加载多个图像，每个图像独立输出端口，未上传图像的端口输出 None 仍可链接
"""

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
