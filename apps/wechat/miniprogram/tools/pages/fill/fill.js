const api = require('../../utils/api');
function track(name, data = {}) { const app = getApp(); if (app && typeof app.trackAnalytics === 'function') app.trackAnalytics(name, Object.assign({ product: 'tools' }, data)); }

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: { id: '', session: null, name: '', selected: [], selectedMap: {}, token: '', loading: false, error: '', gridStyle: '' },
  onLoad(options) {
    const id = decodeURIComponent(options.id || '');
    track('page_view', { itemId: id || undefined });
    this.setData({ id, token: wx.getStorageSync(`navitools_response_${id}`) || '' });
    wx.showShareMenu({ menus: ['shareAppMessage'] });
    this.load();
  },
  async load() {
    try {
      const session = await api.request(`/sessions/${encodeURIComponent(this.data.id)}`);
      const next = { session, gridStyle: `--days:${session.days.length}` };
      if (this.data.token) {
        try {
          const response = await api.request(`/sessions/${encodeURIComponent(this.data.id)}/responses/${encodeURIComponent(this.data.token)}`);
          next.name = response.respondentName || '';
          next.selected = response.slots || [];
          next.selectedMap = Object.fromEntries(next.selected.map(id => [id, true]));
        } catch (error) { wx.removeStorageSync(`navitools_response_${this.data.id}`); next.token = ''; }
      }
      this.setData(next);
    } catch (error) { this.setData({ error: error.message || '问卷不存在或已到期' }); }
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  inputName(event) { this.setData({ name: event.detail.value }); },
  beginSelect(event) {
    const id = event.currentTarget.dataset.slot;
    this.dragSelecting = !this.data.selectedMap[id];
    this.applySlot(id, this.dragSelecting);
  },
  moveSelect(event) { this.applySlot(event.currentTarget.dataset.slot, this.dragSelecting); },
  endSelect() { this.dragSelecting = null; },
  applySlot(id, enabled) {
    if (!id || this.dragSelecting === null) return;
    const map = Object.assign({}, this.data.selectedMap);
    if (enabled) map[id] = true; else delete map[id];
    this.setData({ selectedMap: map, selected: Object.keys(map) });
  },
  async submit() {
    if (!this.data.selected.length) return wx.showToast({ title: '请至少选择一个时段', icon: 'none' });
    this.setData({ loading: true, error: '' });
    try {
      const result = await api.request(`/sessions/${encodeURIComponent(this.data.id)}/responses`, { respondentName: this.data.name, slots: this.data.selected, respondentToken: this.data.token || undefined }, 'POST');
      wx.setStorageSync(`navitools_response_${this.data.id}`, result.responseToken);
      this.setData({ token: result.responseToken });
      track('tool_response', { itemId: this.data.id });
      wx.showToast({ title: '已提交' });
    } catch (error) { this.setData({ error: error.message || '提交失败' }); }
    finally { this.setData({ loading: false }); }
  },
  onShareAppMessage() { return { title: this.data.session ? `请填写：${this.data.session.title}` : '空闲时间问卷', path: `/tools/pages/fill/fill?id=${encodeURIComponent(this.data.id)}` }; }
});
