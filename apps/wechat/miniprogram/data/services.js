module.exports = [
  {
    id: 'words',
    name: 'NaviWords',
    description: '词汇、错题与学习进度',
    path: '/words/pages/index/index',
    webUrl: 'https://study.example.test/words/',
    serviceMode: 'sync',
    visibility: 'public'
  },
  {
    id: 'mt',
    name: 'NaviMT',
    description: '题库、错题与练习进度',
    path: '/mt/pages/index/index',
    webUrl: 'https://study.example.test/mt/',
    serviceMode: 'sync',
    visibility: 'public'
  },
  {
    id: 'reading',
    name: 'NaviReading',
    description: '书签、批注与阅读断点',
    path: '/reading/pages/index/index',
    webUrl: 'https://study.example.test/reading/',
    serviceMode: 'sync',
    visibility: 'hidden'
  },
  {
    id: 'plan',
    name: 'NaviPlan',
    description: '培养方案、课程与学分审计',
    path: '/plan/pages/index/index',
    webUrl: 'https://study.example.test/naviplan/',
    serviceMode: 'sync',
    visibility: 'hidden'
  },
  {
    id: 'tools',
    name: 'NaviTools',
    description: '问卷所有权、配额与管理权限',
    path: '/tools/pages/index/index',
    webUrl: 'https://study.example.test/tools/',
    serviceMode: 'account',
    visibility: 'public'
  }
];
