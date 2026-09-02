"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import type {
  AIProviderCatalogItem,
  AIProviderConfig,
  AIProviderConnection,
  AIProviderName,
} from "@/lib/types";

interface ProviderForm {
  apiKey: string;
  model: string;
  isEnabled: boolean;
  isDefault: boolean;
}

interface Notice {
  type: "success" | "error";
  text: string;
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "操作失败，请稍后重试";
}

function buildForms(
  catalog: AIProviderCatalogItem[],
  configs: AIProviderConfig[],
  previous: Partial<Record<AIProviderName, ProviderForm>> = {},
) {
  return Object.fromEntries(
    catalog.map((item) => {
      const config = configs.find((candidate) => candidate.provider === item.provider);
      return [
        item.provider,
        {
          apiKey: previous[item.provider]?.apiKey || "",
          model: config?.model || previous[item.provider]?.model || item.default_model,
          isEnabled: config?.is_enabled ?? previous[item.provider]?.isEnabled ?? true,
          isDefault: config?.is_default ?? previous[item.provider]?.isDefault ?? false,
        },
      ];
    }),
  ) as Record<AIProviderName, ProviderForm>;
}

export function AIProviderSettings() {
  const [catalog, setCatalog] = useState<AIProviderCatalogItem[]>([]);
  const [configs, setConfigs] = useState<AIProviderConfig[]>([]);
  const [forms, setForms] = useState<Partial<Record<AIProviderName, ProviderForm>>>({});
  const [notices, setNotices] = useState<Partial<Record<AIProviderName, Notice>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");

  const configMap = useMemo(
    () => new Map(configs.map((config) => [config.provider, config])),
    [configs],
  );

  const load = useCallback(async () => {
    try {
      const [catalogItems, savedConfigs] = await Promise.all([
        api<AIProviderCatalogItem[]>("/ai/providers/catalog"),
        api<AIProviderConfig[]>("/ai/providers"),
      ]);
      setCatalog(catalogItems);
      setConfigs(savedConfigs);
      setForms((current) => buildForms(catalogItems, savedConfigs, current));
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateForm(provider: AIProviderName, changes: Partial<ProviderForm>) {
    setForms((current) => {
      const existing = current[provider];
      if (!existing) return current;
      return { ...current, [provider]: { ...existing, ...changes } };
    });
  }

  function showNotice(provider: AIProviderName, notice: Notice) {
    setNotices((current) => ({ ...current, [provider]: notice }));
  }

  async function save(provider: AIProviderName) {
    const form = forms[provider];
    const existing = configMap.get(provider);
    if (!form) return;
    if (!existing && !form.apiKey.trim()) {
      showNotice(provider, { type: "error", text: "首次配置时请填写 API Key" });
      return;
    }
    setBusy(`${provider}:save`);
    setNotices((current) => ({ ...current, [provider]: undefined }));
    try {
      await api<AIProviderConfig>(`/ai/providers/${provider}`, {
        method: "PUT",
        body: JSON.stringify({
          ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {}),
          model: form.model.trim(),
          is_enabled: form.isEnabled,
          is_default: form.isDefault,
        }),
      });
      updateForm(provider, { apiKey: "" });
      await load();
      showNotice(provider, { type: "success", text: "配置已加密保存" });
    } catch (error) {
      showNotice(provider, { type: "error", text: errorMessage(error) });
    } finally {
      setBusy("");
    }
  }

  async function testConnection(provider: AIProviderName) {
    setBusy(`${provider}:test`);
    setNotices((current) => ({ ...current, [provider]: undefined }));
    try {
      const result = await api<AIProviderConnection>(`/ai/providers/${provider}/test`, {
        method: "POST",
      });
      showNotice(provider, {
        type: "success",
        text: `连接成功 · ${result.model} · ${result.latency_ms} ms`,
      });
    } catch (error) {
      showNotice(provider, { type: "error", text: errorMessage(error) });
    } finally {
      setBusy("");
    }
  }

  async function remove(provider: AIProviderName, displayName: string) {
    if (!window.confirm(`确定删除 ${displayName} 配置吗？删除后需要重新输入 API Key。`)) return;
    setBusy(`${provider}:delete`);
    try {
      await api(`/ai/providers/${provider}`, { method: "DELETE" });
      await load();
      showNotice(provider, { type: "success", text: "配置已删除" });
    } catch (error) {
      showNotice(provider, { type: "error", text: errorMessage(error) });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="ai-settings-card" aria-labelledby="ai-settings-title">
      <header className="ai-settings-header">
        <div className="ai-settings-icon"><Sparkles size={20} /></div>
        <div>
          <span className="eyebrow">AI PROVIDERS</span>
          <h2 id="ai-settings-title">模型与 API Key</h2>
          <p>Key 只发送到知闲后端并加密保存，不会返回浏览器或写入日志。</p>
        </div>
      </header>

      {loading && <p className="provider-loading">正在读取模型设置…</p>}
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {!loading && !loadError && (
        <div className="provider-settings-grid">
          {catalog.map((item) => {
            const config = configMap.get(item.provider);
            const form = forms[item.provider];
            const notice = notices[item.provider];
            if (!form) return null;
            const isBusy = busy.startsWith(`${item.provider}:`);
            return (
              <article className="ai-provider-card" key={item.provider}>
                <div className="provider-card-head">
                  <div>
                    <h3>{item.display_name}</h3>
                    <span>{item.base_url}</span>
                  </div>
                  <div className="provider-badges">
                    <span className={config ? "provider-status configured" : "provider-status"}>
                      {config ? "已配置" : "待配置"}
                    </span>
                    {config?.is_default && <span className="provider-status default">默认</span>}
                  </div>
                </div>

                <div className="provider-fields">
                  <label>
                    模型
                    <input
                      list={`${item.provider}-models`}
                      value={form.model}
                      onChange={(event) => updateForm(item.provider, { model: event.target.value })}
                      disabled={isBusy}
                    />
                    <datalist id={`${item.provider}-models`}>
                      {item.models.map((model) => <option value={model} key={model} />)}
                    </datalist>
                  </label>
                  <label>
                    API Key
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.apiKey}
                      placeholder={config ? `${config.masked_api_key}（留空表示不修改）` : "粘贴厂商 API Key"}
                      onChange={(event) => updateForm(item.provider, { apiKey: event.target.value })}
                      disabled={isBusy}
                    />
                  </label>
                </div>

                <div className="provider-switches">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.isEnabled}
                      onChange={(event) => updateForm(item.provider, {
                        isEnabled: event.target.checked,
                        ...(!event.target.checked ? { isDefault: false } : {}),
                      })}
                      disabled={isBusy}
                    />
                    启用该厂商
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={form.isDefault}
                      onChange={(event) => updateForm(item.provider, {
                        isDefault: event.target.checked,
                        ...(event.target.checked ? { isEnabled: true } : {}),
                      })}
                      disabled={isBusy}
                    />
                    设为默认模型
                  </label>
                </div>

                {notice && (
                  <p className={`provider-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
                    {notice.text}
                  </p>
                )}

                <div className="provider-actions">
                  <button className="primary-button" type="button" onClick={() => void save(item.provider)} disabled={isBusy || !form.model.trim()}>
                    {busy === `${item.provider}:save` ? "保存中…" : "保存配置"}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void testConnection(item.provider)} disabled={isBusy || !config}>
                    {busy === `${item.provider}:test` ? "测试中…" : "测试连接"}
                  </button>
                  {config && (
                    <button className="provider-delete" type="button" onClick={() => void remove(item.provider, item.display_name)} disabled={isBusy}>
                      删除
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="ai-key-note">连接测试只读取厂商模型列表，用于验证 Key 和模型权限，不会发送学习内容。</p>
    </section>
  );
}
