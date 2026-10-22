const api = require('../../utils/api');
const forms = require('../../utils/form');
function track(name, data = {}) { const app = getApp(); if (app && typeof app.trackAnalytics === 'function') app.trackAnalytics(name, Object.assign({ product: 'tools' }, data)); }

Page({
  behaviors: [require('../../../behaviors/theme')],
  data: { id: '', form: forms.defaultForm(), loading: false, error: '' },
  onLoad(options) { const id = options.id ? decodeURIComponent(options.id) : ''; track('page_view', { itemId: id || undefined }); if (id) { this.setData({ id }); this.load(); } },
  async load() {
    try { const session = await api.request(`/sessions/${encodeURIComponent(this.data.id)}`); this.setData({ form: forms.fromSession(session) }); }
    catch (error) { this.setData({ error: error.message || '读取问卷失败' }); }
  },
  changeText(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  changeValue(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  changeRequired(event) { this.setData({ 'form.nameRequired': event.detail.value.includes('required') }); },
  async save() {
    this.setData({ loading: true, error: '' });
    try {
      const body = forms.payload(this.data.form);
      const session = this.data.id
        ? await api.request(`/sessions/${encodeURIComponent(this.data.id)}`, body, 'PATCH', true)
        : await api.request('/sessions', body, 'POST', true);
      if (!this.data.id) track('tool_created', { itemId: session.id });
      wx.showToast({ title: this.data.id ? '已保存' : '已创建' });
      setTimeout(() => wx.redirectTo({ url: `/tools/pages/stats/stats?id=${encodeURIComponent(session.id)}` }), 350);
    } catch (error) { this.setData({ error: error.message || '保存失败' }); }
    finally { this.setData({ loading: false }); }
  }
});
