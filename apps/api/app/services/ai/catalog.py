from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderSpec:
    key: str
    display_name: str
    base_url: str
    default_model: str
    models: tuple[str, ...]
    supports_tools: bool = True
    supports_streaming: bool = True


PROVIDER_SPECS: dict[str, ProviderSpec] = {
    "deepseek": ProviderSpec(
        key="deepseek",
        display_name="DeepSeek",
        base_url="https://api.deepseek.com",
        default_model="deepseek-v4-flash",
        models=("deepseek-v4-flash", "deepseek-v4-pro"),
    ),
    "minimax": ProviderSpec(
        key="minimax",
        display_name="MiniMax",
        base_url="https://api.minimaxi.com/v1",
        default_model="MiniMax-M3",
        models=("MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"),
    ),
}


def get_provider_spec(provider: str) -> ProviderSpec | None:
    return PROVIDER_SPECS.get(provider.lower())
