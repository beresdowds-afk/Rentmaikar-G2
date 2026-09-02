import { PluginEvent, RentMaikarPlugin } from "./pluginTypes";

class PluginManager {
  private plugins: Map<string, RentMaikarPlugin> = new Map();
  private callCounts: Map<string, number> = new Map();

  register(plugin: RentMaikarPlugin) {
    this.plugins.set(plugin.id, plugin);
    if (!this.callCounts.has(plugin.id)) this.callCounts.set(plugin.id, 0);
  }

  async activate(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin not found: ${id}`);
    plugin.enabled = true;
    await plugin.initialize();
  }

  async deactivate(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    plugin.enabled = false;
    await plugin.deactivate();
  }

  async process(event: PluginEvent) {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      try {
        await plugin.processEvent(event);
        this.callCounts.set(plugin.id, (this.callCounts.get(plugin.id) ?? 0) + 1);
      } catch (e) {
        console.warn(`[plugin:${plugin.id}] processEvent failed`, e);
      }
    }
  }

  getPlugins() {
    return Array.from(this.plugins.values()).map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      callCount: this.callCounts.get(p.id) ?? 0,
    }));
  }

  getCallCount(id: string) {
    return this.callCounts.get(id) ?? 0;
  }

  resetCallCounts() {
    this.callCounts.forEach((_, k) => this.callCounts.set(k, 0));
  }
}

const pluginManager = new PluginManager();
export default pluginManager;
