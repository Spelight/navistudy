const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function write(file, text) { const p=path.join(root,file); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,text+'\n'); }
const pairs = [['clarify','澄清'],['collaborate','协作'],['revision','修订'],['plan','计划'],['learn','学习'],['review','复习'],['practice','练习'],['goal','目标'],['focus','专注'],['progress','进展'],['create','创造'],['share','分享'],['read','阅读'],['write','写作'],['listen','听'],['speak','说'],['question','问题'],['answer','回答'],['daily','每日的'],['simple','简单的'],['useful','有用的'],['build','构建'],['test','测试'],['improve','改善'],['finish','完成'],['begin','开始'],['remember','记住'],['understand','理解'],['choose','选择'],['explain','解释']];
const books=[{id:'b3',title:'Demo Book 3',units:[1,4]},{id:'b4',title:'Demo Book 4',units:[101,102]},{id:'dual',title:'Demo Extra',units:[201]},{id:'b5',title:'Demo Book 5',units:[301,302,303,304,305]}];
const words=books.flatMap(b=>b.units.flatMap(u=>pairs.map(([w,c],i)=>({u,t:'w',w,p:'',e:`Demo vocabulary: ${w}`,c,idx:u*100+i}))));
words.push(...['make a plan','review a lesson','set a goal','take a note'].map((w,i)=>({u:1,t:'trans',w,e:['制定计划','复习课程','设定目标','做笔记'][i],c:'',p:'',idx:9000+i})));
const unitLabels=Object.fromEntries(books.flatMap(b=>b.units.map((u,i)=>[u,`${b.title} Unit ${i+1}`])));
const vocab={books,words,unitLabels};
write('packages/words-mini/miniprogram/data/vocab.js','module.exports = '+JSON.stringify(vocab)+';');
write('examples/words/vocab.js','module.exports = '+JSON.stringify(vocab)+';');
write('apps/words-web/vocabulary.js', ['db','db4','dbDual'].map((name,i)=>`const ${name} = ${JSON.stringify(words.filter(w=>books[i].units.includes(w.u)))};`).join('\n'));
write('apps/words-web/book5.js','const db5 = '+JSON.stringify(words.filter(w=>w.u>=301))+';');
write('apps/words-web/collocations.js','const wordCollocations = {};');
const names=['poetryQuestions','novelQuestions','b4u1FillG1Pool','b4u1FillG2Pool','b4u1PhrasePool','b4u1Crossword','CW_WORDS',...['B3U1','B3U4','B3U5','B3U9','B3U13','B4U2','B4U3','B4U8','B4U9','Dual201','Dual202','Dual203'].flatMap(x=>['CW_'+x,'def'+x]),...['B3U1','B3U4','B3U5P1','B3U5P2','B3U9P1','B3U9P2','B3U13','B4U2','B4U3','B4U9','B4U8','Dual1','Dual2','Dual3','Dual4','Dual5','Dual202','Dual203'].map(x=>'fill'+x)];
write('apps/words-web/questions.js',names.map(n=>`const ${n} = [];`).join('\n'));
const questions=[
 {id:'demo-single',type:'single',stem:'哪一项属于主动复习？',options:[{key:'A',text:'尝试回忆答案'},{key:'B',text:'只翻看标题'},{key:'C',text:'跳过练习'}],answer:['A']},
 {id:'demo-multiple',type:'multiple',stem:'哪些操作有助于管理学习资料？',options:[{key:'A',text:'按主题整理'},{key:'B',text:'保留备份'},{key:'C',text:'删除全部记录'}],answer:['A','B']},
 {id:'demo-judge',type:'truefalse',stem:'复习计划可以根据掌握情况调整。',options:[],answer:'正确'},
 {id:'demo-short',type:'short',stem:'写出一个可执行的学习目标。',options:[],answer:'例如：今天复习十个词并记录错题。'}
].map(q=>({...q,chapter:'学习方法',source:'原创演示',sources:['原创演示'],modern:true,legacy:false,disabled:false,explanation:'原创演示题，不属于课程题库。'}));
const bank={title:'NaviMT 原创演示题',generatedAt:'demo',notice:'公开演示数据',chapters:['学习方法'],sources:[],questions,stats:{total:4,byType:{single:1,multiple:1,truefalse:1,short:1},byChapter:{'学习方法':4},modern:4,legacy:0,conflicts:0,sources:0}};
write('apps/mt-web/src/data/question-bank.json',JSON.stringify(bank,null,2));
write('examples/mt/question-bank.json',JSON.stringify(bank,null,2));
write('packages/mt-mini/miniprogram/data/question-bank.js','module.exports = '+JSON.stringify(bank)+';');
write('apps/mt-web/src/data/material-files.js','export default {};');
write('packages/mt-mini/miniprogram/data/material-files.js','module.exports = {baseUrl:"https://example.test/downloads/",files:{}};');
const reading={edition:'NaviReading original demo',scope:'Five demo units',built:'2026-10-22',units:Array.from({length:5},(_,i)=>({id:i+1,title:`A Small Step ${i+1}`,titleZh:`学习的一小步 ${i+1}`,author:'NaviStudy Demo',pages:[15,15],paragraphs:[{n:1,page:15,en:'A clear goal makes a small task easier to begin. Review your progress and choose the next step.',zh:'明确的目标让小任务更容易开始。回顾进展，然后选择下一步。'}],notes:[],vocabulary:[{u:i+1,p:1,term:'goal',en:'something you want to achieve',zh:'目标',kind:'word'}],phrases:[]}))};
reading.scansAvailable = false;
reading.units.forEach(unit => {
  unit.textbookNotes = [];
  unit.introduction = [{section: "The text", page: 15, en: "An original example about making progress.", zh: "关于取得进展的原创示例。"}];
  unit.structure = [[1, 1, "Choose a next step", "选择下一步", "从明确目标到回顾进展。"]];
  unit.theme = ["Small steps support learning.", "小步骤帮助学习。"];
  unit.background = ["Written for the NaviStudy public demo.", "为 NaviStudy 公开演示编写。"];
});
write('apps/reading-web/study-data.json',JSON.stringify(reading,null,2));
write('apps/reading-web/study-data.js','window.STUDY_DATA = '+JSON.stringify(reading)+';');
write('packages/reading-mini/miniprogram/data/study-data.js','module.exports = '+JSON.stringify(reading)+';');
console.log('demo-data: original fixtures generated');
