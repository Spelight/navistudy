const api = require('../../utils/api');
const qrcode = require('../../vendor/qrcode');

Page({
  data: { id: '', stats: null, responses: [], cells: {}, gridStyle: '', loading: false, error: '', shareUrl: '', qrDataUrl: '' },
  onLoad(options) {
    const id = decodeURIComponent(options.id || '');
    const shareUrl = `${String(getApp().globalData.toolsWebBase).replace(/\/+$/, '')}/availability/${encodeURIComponent(id)}`;
    this.setData({ id, shareUrl });
    wx.showShareMenu({ menus: ['shareAppMessage'] });
    this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const [stats, responses] = await Promise.all([
        api.request(`/sessions/${encodeURIComponent(this.data.id)}/stats`, {}, 'GET', true),
        api.request(`/sessions/${encodeURIComponent(this.data.id)}/responses`, {}, 'GET', true)
      ]);
      const max = Math.max(1, Number(stats.maxCount || 0));
      const cells = {};
      (stats.cells || []).forEach(cell => { cells[cell.slotId] = Object.assign({}, cell, { heat: cell.count ? Math.max(1, Math.ceil(cell.count / max * 4)) : 0 }); });
      this.setData({ stats, responses, cells, gridStyle: `--days:${stats.session.days.length}` });
    } catch (error) {
      if (error && error.statusCode === 404) {
        wx.removeStorageSync('navistudy_tools_continuation');
        wx.showModal({
          title: '问卷已失效',
          content: '该问卷可能已到期或被删除，已从“上次使用”中移除。',
          showCancel: false,
          success: () => wx.redirectTo({ url: '/tools/pages/index/index' })
        });
      } else {
        this.setData({ error: error.message || '读取统计失败' });
      }
    }
    finally { this.setData({ loading: false }); }
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  inspect(event) {
    const cell = this.data.cells[event.currentTarget.dataset.slot] || { count: 0, names: [] };
    wx.showModal({ title: `${cell.count} 人有空`, content: cell.names.length ? cell.names.join('、') : '这个时段还没有人选择。', showCancel: false });
  },
  edit() { wx.navigateTo({ url: `/tools/pages/availability/availability?id=${encodeURIComponent(this.data.id)}` }); },
  copyLink() { wx.setClipboardData({ data: this.data.shareUrl }); },
  showQr() {
    try {
      const code = qrcode(0, 'M');
      code.addData(this.data.shareUrl);
      code.make();
      this.setData({ qrDataUrl: code.createDataURL(8, 16) });
    } catch (error) { this.setData({ error: '二维码生成失败，请使用复制链接。' }); }
  },
  closeQr() { this.setData({ qrDataUrl: '' }); },
  noop() {},
  async remove() {
    const result = await new Promise(resolve => wx.showModal({ title: '删除问卷？', content: '问卷和全部填写记录会立即删除，无法恢复。', confirmColor: '#a42f28', success: resolve }));
    if (!result.confirm) return;
    try {
      await api.request(`/sessions/${encodeURIComponent(this.data.id)}`, {}, 'DELETE', true);
      wx.removeStorageSync('navistudy_tools_continuation');
      wx.showToast({ title: '已删除' });
      setTimeout(() => wx.redirectTo({ url: '/tools/pages/index/index' }), 300);
    }
    catch (error) { this.setData({ error: error.message || '删除失败' }); }
  },
  editResponse(event) {
    const response = this.data.responses.find(item => item.token === event.currentTarget.dataset.token);
    if (!response) return;
    wx.showModal({ title: response.respondentName || '未命名填写', editable: true, placeholderText: '修改填写人姓名', content: response.respondentName || '', success: async result => {
      if (!result.confirm) return;
      try { await api.request(`/sessions/${encodeURIComponent(this.data.id)}/responses/${encodeURIComponent(response.token)}`, { respondentName: result.content, slots: response.slots }, 'PATCH', true); this.load(); }
      catch (error) { this.setData({ error: error.message || '修改失败' }); }
    }});
  },
  onShareAppMessage() { return { title: this.data.stats ? `请填写：${this.data.stats.session.title}` : '空闲时间问卷', path: `/tools/pages/fill/fill?id=${encodeURIComponent(this.data.id)}` }; }
});
