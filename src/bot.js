import { WechatyBuilder } from 'wechaty';
import notifier from 'node-notifier';
import { FileBox }  from 'file-box'
import axios from 'axios';
const botName = 'BlueFatty'; // 机器人名字：蓝胖子
const bot = WechatyBuilder.build(
  {
    name: botName, // 指定一个名称，生成 memory-card 文件
  }
);
//const bot = Wechaty.build();
const KEYWORDS = ['物理']; // 替换为你要监控的关键字
const apiKey = 'sk-key';//作者个人使用，示例
let rooms = new Set(); // 使用Set来存储唯一的群聊
let targetRoom = null;
let myself = null;
let targetContact = null;
bot
  .on('scan', (qrcode, status) => {
    const qrcodeUrl = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
    console.log(`Scan QR Code to login: ${status}\n${qrcodeUrl}`);
  })
  .on('login', async user => {
    console.log(`User ${user} logged in`);
    // 获取所有群聊
    //rooms = await bot.Room.findAll();
    // 多次调用 findAll 并合并结果
    for (let i = 0; i < 14; i++) { // 调整调用次数
      const newRooms = await bot.Room.findAll();
      newRooms.forEach(room => rooms.add(room));
      await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
      }
    myself = await bot.Contact.find({ name: user.name() });
    // 查找群聊名称中包含“菁硕”的群聊
     for (const room of rooms) {
      const topic = await room.topic();
      if (typeof topic === 'string' && topic.includes('菁硕')) {
        targetRoom = room;
        //break;
      }
      if (typeof topic === 'string' && topic.includes('物理接单群')) {
        targetContact = room;
        //break;
      }
      console.log(`---------- ${topic}\n`);
    }
    console.log('群聊数量总计---------'+rooms.size)
  })
  .on('message', async message => {
    try {
    if (message) {
      const type = message.type(); // 获取消息类型
      if (type === bot.Message.Type.Attachment || type === bot.Message.Type.Image || type === bot.Message.Type.Video) {
        console.log("文件消息，不进行信息提取。");
        return;
      }
      const text = message.text();
      for (const keyword of KEYWORDS) {
        if (text.includes(keyword)) {
          //检测文本信息是否符合规则，不符合则返回
          if(!textCheck(text)){
            continue;
          }
          //检测到关键字
          console.log(`Detected keyword: ${keyword}`);
          const loadMessage={
            source: '',
            from:'',
            sendingTime:'',
            orderingInformation:''
          }
          const fromContact = message.talker();
          loadMessage.from = fromContact ? fromContact.name() : '未知';
          loadMessage.sendingTime=timeToString(message.date());
          if (targetRoom && targetRoom.id === message.room()?.id) {
            loadMessage.orderingInformation = text;
          } else {
            loadMessage.orderingInformation = extractPhysicsTutoringInfo(text);
          }
          //ai判断
          loadMessage.orderingInformation = await aiChat(loadMessage.orderingInformation)
          if(isValidLength(loadMessage.orderingInformation)){
            console.log("gpt已经确认过这是目的信息")
          }else{
            console.log("gpt认为这不是目的信息");
            continue;
          }
          //判断是否群聊
          if (message.room()) {
            const topic = await message.room().topic();
            loadMessage.source = '来源于群聊:' + topic;
          } else {
            loadMessage.source = '来源于私聊：' + (fromContact ? fromContact.name() : '未知');
          }

          if (myself) {
             // 调试信息
             console.log(`Sending message to self: ${loadMessage.source}\n发送者: ${loadMessage.from}\n出单时间: ${loadMessage.sendingTime}\n${loadMessage.orderingInformation}`);
             console.log(`Myself contact: ${JSON.stringify(myself)}`);
             // 发消息到接单群
             const finalMessage = `${loadMessage.source}\n发送者: ${loadMessage.from}\n出单时间: ${loadMessage.sendingTime}\n客单信息: ${loadMessage.orderingInformation}`;
             if(isValid(loadMessage)) {
              await targetContact.say(finalMessage);
              //电脑通知
              notifier.notify({
              title: '新征程起',
              message: `Detected keyword: ${keyword}\nMessage: ${finalMessage}`
            });
            }
        }
      }
    }
  }
}catch (error) {
  if (error instanceof AssertionError || error.message.includes('message not found')) {
      // 不打印断言错误信息
      // 不打印找不到消息
  } else {
      console.error(error); // 打印其他类型的错误
  }
}
  });

bot.start().catch(error => {
  console.error('Bot start error:', error);
});

  //定义将Date对象转换为字符串函数
  function timeToString(timeObj){
    var str = "";
    var year = timeObj.getFullYear();
    var month = timeObj.getMonth() + 1; // 月份加 1
    var date = timeObj.getDate();
    var time = timeObj.toTimeString().split(" ")[0];
    var rex = new RegExp(/:/g);
    str = year+"-"+month+"-"+date+" "+time.replace(rex,"-");
   console.log("出单时间："+str);
   return str;
}


//分割客单信息
function extractPhysicsTutoringInfo(text) {
  // 将文本按行分割
  const lines = text.split('\n');
  const physicsInfo = [];
  let isPhysicsSection = false;

  lines.forEach(line => {
      // 检测到关键字“物理”
      if (line.includes('物理')) {
          isPhysicsSection = true;
      }

      // 如果在物理家教单的相关信息部分
      if (isPhysicsSection) {
          // 检测到整行空格，表示结束
          if (line.trim() === '') {
              isPhysicsSection = false;
          } else {
              physicsInfo.push(line);
          }
      }
  });

  // 返回包含物理家教单信息的字符串
  return physicsInfo.join('\n');
}

function textCheck(text){
  if (!isValidLength(text)) {
    console.log('文本包含关键字，但是字数少于20，不予发送');
    return false;
  }
  // 验证和过滤不需要的信息
  if (isQuotedMessage(text)) {
    console.log('过滤掉引用的对话');
    return false;
  }
  return true;
}


//判断字符串长度是否超过20
function isValidLength(str) {
  return str.length >= 20;
}

// 验证是否为引用的对话
function isQuotedMessage(text) {
  // const quotePattern = /^「.*」.*- - - - - - - - - - - - - - -/;
  // const quotePattern = /^「.*」\n- - - - - - - - - - - - - - -/;
  // const quotePattern = /^「.*」.*\n- - - - - - - - - - - - - - -\n/;
  //const quotePattern = /^「.*」.*\n?- - - - - - - - - - - - - - -\n?/;
  //return quotePattern.test(text);
  const quotePattern = /^「[\s\S]*?- - - - - - - - - - - - - - -/;
  const match = text.match(quotePattern);
  //console.log(match);
  return match !== null;
}




//发送信息校验
function isValid(loadMessage) {
  if(loadMessage.from==myself.name()) return false //检验消息是否来源于本人
  if(loadMessage.orderingInformation.length > 3000) return false //客单信息不能过长
  return true;
}

async function aiChat(info){
  const text = info;
  // 构建提示词
  const prompt = `请识别这条信息里有没有物理家教客单的信息，如果有请帮我提取，并直接把提取出的信息直接发送给我，如果没有请回复0，不要发无关信息或者作多余的回答：\n\n"${text}"`;
  try {
    const response = await axios.post('https://apitb.gueai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    }, {
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept':'application/json'
      },
    });

    const reply = response.data.choices[0].message.content.trim();
    //console.log(reply)
    console.log('运行到此处1111');
    return reply;
    //await message.say(reply);
  } catch (error) {
    console.error('Error:', error);
    console.log('对不起，我暂时无法处理这个消息。');
    return '0';
  }
}


