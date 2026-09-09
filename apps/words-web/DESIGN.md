---
name: NaviWords Web
description: 面向教材单元学习与考前复习的深色课程工作台
colors:
  primary: "#4d8dff"
  primary-soft: "#182b4a"
  canvas: "#0b0d10"
  navigation: "#101318"
  surface: "#15191f"
  surface-raised: "#1b2028"
  border: "#2a3039"
  border-strong: "#3a4350"
  text: "#f5f7fa"
  text-muted: "#9ba6b5"
  success: "#37c889"
  success-soft: "#122c22"
  danger: "#ff6b67"
  danger-soft: "#351a1b"
  warning: "#f2bc59"
typography:
  display:
    fontFamily: '"NaviWords Display", Aptos, "Microsoft YaHei UI", sans-serif'
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: 'Aptos, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  label:
    fontFamily: 'Aptos, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0"
rounded:
  control: "5px"
  button: "6px"
  surface: "8px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "0 18px"
    height: "42px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "42px"
  input:
    backgroundColor: "{colors.navigation}"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "18px"
---

# Design System: NaviWords Web

## Overview

**Creative North Star: "课程复习控制台"**

NaviWords 是一套紧凑、克制的课程学习工作台。固定导航承载稳定的信息架构，中央区域始终只突出当前任务；教材、单元、题型和学习状态采用同一套控件语言，避免首页现代而子页面割裂。

界面以深色中性表面承载高密度复习内容，钴蓝只用于当前选择和主要动作，绿色、红色分别保留给正确和错误反馈。视觉表达服务于连续背诵、快速筛选和考前训练，不加入排行榜、评论或装饰性社交层。

**Key Characteristics:**
- 固定桌面导航与四项移动端底部导航。
- Book 与 Unit 上下文优先于宣传内容。
- 紧凑列表、清晰边界、一屏一项主要学习任务。
- 新版和旧版始终拥有独立、可见的切换入口。

## Colors

色彩采用炭黑中性底、低明度表面和少量高辨识状态色。

### Primary
- **行动钴蓝**：用于主要按钮、选中标签、当前导航和焦点边框。
- **深蓝衬底**：用于选中态和图标容器，不作为整页背景。

### Secondary
- **掌握绿**：只表示正确答案、成功和完成状态。
- **错题红**：只表示错误答案、错题筛选和危险操作。
- **提示黄**：用于拼写提示和需要注意的非错误状态。

### Neutral
- **工作台黑**：页面画布。
- **导航黑**：固定应用导航与输入底色。
- **面板炭灰**：卡片、练习容器和列表项。
- **结构灰**：边框、分隔线和滚动条。
- **正文白**与**辅助灰**：保证主要内容和微文案层级清楚。

**The Status Ownership Rule.** 蓝色负责行动，绿色和红色只负责答案状态，不交换语义。

## Typography

**Display Font:** NaviWords Display（本地 WOFF2，自托管）  
**Body Font:** Aptos，中文回退至 Microsoft YaHei UI / Microsoft YaHei

**Character:** 标题字体提供简洁但可识别的产品性格；正文使用高可读系统字体，适合中英文混排和长时间复习。

### Hierarchy
- **Display**（400，28px，1.2）：品牌、页面标题和首页继续学习标题。
- **Headline**（700-800，20-24px，1.2）：练习题词、模块标题和词典词头。
- **Title**（700-750，14-17px，1.4）：卡片标题、导航项和区块标题。
- **Body**（400-600，13-16px，1.6）：释义、题目、选项和说明数据。
- **Label**（700，11-12px，1.45）：Book/Unit、统计标签和筛选器。

**The Zero Tracking Rule.** 全站字间距保持 0；不使用大写加宽字距制造层级。

## Layout

桌面端使用 228px 固定左侧导航，内容页在其右侧以最大 1440px 的工作区展开。首页采用主任务区与 310px 账号侧栏；练习页采用约 260px 的教材/单元控制栏和最大 760px 的中央作答区。大纲使用双列词汇表，备考专项使用三列卡片，填字使用棋盘与线索双栏。

820px 以下切换为单列内容、48px 顶部应用栏和四项底部导航。筛选器横向滚动，学习卡与题目维持稳定高度；大纲、备考和词库改为单列。页面为底部导航预留空间，固定控件不得遮挡正文。

## Elevation & Depth

系统以色阶和边框建立层级，静态页面基本无阴影。仅导航浮层、提示和对话框使用柔和环境阴影（`0 14px 34px rgba(0,0,0,.24)`），不使用硬偏移阴影。

**The Flat-by-Default Rule.** 常驻面板依靠背景和 1px 边框分层；阴影只属于真正覆盖内容的浮层。

## Shapes

控件采用 5-6px 圆角，面板和卡片采用 8px 圆角。图标按钮保持稳定的正方形尺寸；列表项、答案选项和筛选标签均使用 1px 边框。圆形只用于收藏/状态符号或移动端明确的系统图标，不用于普通文字按钮。

## Components

### Buttons
- **Primary:** 钴蓝底、白字、6px 圆角，整页最多一个主操作占据最高视觉权重。
- **Secondary:** 炭灰底与结构灰边框；悬停仅提升表面明度和边框对比。
- **Focus:** 3px 半透明蓝色外轮廓，不能仅用颜色深浅表达键盘焦点。

### Chips
- **Default:** 导航黑底、结构灰边框、辅助文字。
- **Selected:** 深蓝底、钴蓝边框、白色文字，并同步 `aria-pressed`。

### Cards / Containers
- **Corner Style:** 8px 轻圆角。
- **Background:** 面板炭灰；嵌套内容使用导航黑或升高一级的表面色。
- **Border:** 1px 结构灰；常驻卡片不使用阴影。
- **Internal Padding:** 紧凑区块 14-18px，主要任务面板 18-24px。

### Inputs / Fields
- **Style:** 导航黑底、1px 结构灰边框、6px 圆角。
- **Focus:** 边框变为行动钴蓝，文字和占位符保持可读。
- **Answer State:** 正确与错误分别切换到掌握绿和错题红的边框及柔和底色。

### Navigation
- 桌面左栏以图标加文本显示所有一级模块，当前页使用深蓝矩形选中态。
- 移动端底部只保留首页、背词、大纲、我的四项；新旧版切换位于独立顶部应用栏。

### Learning Workspace
- 首页主任务先选 Book，再选 Unit，最后进入背诵、选择或拼写。
- 背诵、选择和拼写共享同一教材范围控制栏与中央任务宽度。
- 填字在首屏同时呈现棋盘、线索、控制和状态；每轮随机 12 词。

## Do's and Don'ts

### Do:
- **Do** 在所有新增页面沿用固定应用导航、页面标题栏和统一筛选器。
- **Do** 让用户始终看见当前 Book、Unit、模式和进度。
- **Do** 使用 Lucide 图标，并为图标按钮提供名称。
- **Do** 让空状态紧凑并提供一个直接下一步。
- **Do** 保持新版与 `index-legacy.html` 完全独立。

### Don't:
- **Don't** 只重做首页而把子页面留在旧视觉系统中。
- **Don't** 加入排行榜、评论或其他与课程复习无关的社交模块。
- **Don't** 用 emoji、Unicode 图形或空色块代替产品图标。
- **Don't** 在固定导航附近放置会覆盖正文的浮动按钮。
- **Don't** 将旧版内联样式和一次性颜色写入新的系统组件。
