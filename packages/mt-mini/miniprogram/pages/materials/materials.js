const questions = require('../../utils/questions');
const manifest = require('../../data/material-files');

const roleNames = {
  review: '重点整理',
  qa: '问答资料',
  reference: '参考资料',
  legacy: '历史试题',
  questions: '题库',
  duplicate: '重复来源'
};

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function groupName(path) {
  if (path.indexOf('1_题库\\') === 0) return '重点与历年资料';
  if (path.indexOf('2_军事理论题库\\') === 0) return '补充题库';
  return '2026 复习资料';
}

const materials = questions.bank.sources.map(source => {
  const file = manifest.files[source.id];
  return Object.assign({}, source, file, {
    group: groupName(source.path),
    roleText: roleNames[source.role] || '参考资料',
    sizeText: formatSize(file.size),
    typeText: file.type.toUpperCase(),
    url: `${manifest.baseUrl}/${file.file}`
  });
});

const groupOrder = ['2026 复习资料', '重点与历年资料', '补充题库'];
const groups = groupOrder.map(title => ({
  title,
  items: materials.filter(item => item.group === title)
}));

Page({
  data: {
    groups,
    total: materials.length,
    downloadingId: ''
  },

  downloadMaterial(event) {
    if (this.data.downloadingId) return;
    const material = materials.find(item => item.id === event.currentTarget.dataset.id);
    if (!material) return;
    this.setData({ downloadingId: material.id });
    wx.showLoading({ title: '下载中', mask: true });
    wx.downloadFile({
      url: material.url,
      success: result => {
        if (result.statusCode !== 200 || !result.tempFilePath) {
          this.showDownloadError();
          return;
        }
        wx.openDocument({
          filePath: result.tempFilePath,
          fileType: material.type,
          showMenu: true,
          fail: () => wx.showModal({
            title: '无法打开文档',
            content: '文件已下载，但当前微信版本无法预览该格式。可使用右上角菜单转发后在其他应用中打开。',
            showCancel: false
          })
        });
      },
      fail: () => this.showDownloadError(),
      complete: () => {
        wx.hideLoading();
        this.setData({ downloadingId: '' });
      }
    });
  },

  showDownloadError() {
    wx.showModal({
      title: '下载失败',
      content: '请检查网络后重试。若持续失败，请确认 mt.example.test 已配置为小程序下载合法域名。',
      showCancel: false
    });
  },

  onShareAppMessage() {
    return {
      title: 'NaviMT 军理通 · 参考资料下载',
      path: '/pages/materials/materials'
    };
  }
});
