from enum import Enum, auto

class ExperimentVariant(str, Enum):
    # Generation variants
    IMAGE_ONLY = "image_only"
    TEXT_LEVEL_1 = "text_level_1"
    TEXT_LEVEL_2 = "text_level_2"
    IMAGE_TEXT_LEVEL_1 = "image_text_level_1"
    IMAGE_TEXT_LEVEL_2 = "image_text_level_2"
    
    # Modification variants
    WITHOUT_ORACLE = "without_oracle"
    PERFECT_HIERARCHY = "perfect_hierarchy"
    PERFECT_CANVAS = "perfect_canvas"

class ModelType(str, Enum):
    GPT4o = "gpt-4o"
    GPT41 = "gpt-4.1"
    CLAUDE35 = "claude-3-5-sonnet"
    GEMINI25FLASH = "gemini-2.5-flash"
    GEMINI25PRO = "gemini-2.5-pro"

class Channel(str, Enum):
    CHANNEL_1 = "channel_1"
    CHANNEL_2 = "channel_2"
    CHANNEL_3 = "channel_3"
    CHANNEL_4 = "channel_4"
    CHANNEL_5 = "channel_5"

class GuidanceType(str, Enum):
    NONE = "none"
    BASIC = "basic"
    ADVANCED = "advanced"
    ORACLE = "oracle" 