const express = require('express');
const router = express.Router();
const subscribeModel = require('../../models/subscribeModel')
const webpush = require("web-push");

const publicKey = 'BDaELLgGYNHLi1choUSCQFtfKmP56DV1f7TJunGM_dqPRgQosEoflD4xEiLYG4DTypK4DWmdZ5H27XthqyYRm0g';
const privateKey = 'aI-x_n1yc2oGwQ_yerbpr-ST86zOg5hdQjfMlOlbOUw'
webpush.setVapidDetails("mailto:blc0000421@gmail.com",publicKey, privateKey);

// 訂閱
router.post("/api/ws/save-subscribe", async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.send({ type:'error', message: "missing subscription" });
    }

    const endpoint = subscription.endpoint;

    const existing = await subscribeModel.findOne({ endpoint });
    if (existing) {
      existing.subscription = subscription;
      await existing.save();
      return res.send({ type:'success', message: "updated subscription" });
    }

    await subscribeModel.create({ endpoint,subscription});

    return res.send({ type:'success', message: "saved subscription" });
  } 
  catch (err) {
    console.error(err);
    return res.send({ type:'error', message: "server error when saving subscription" });
  }
});


// 推播訊息
async function pushNotification(title = '檸檬小天地', message = '你有一則新通知', url='./', filterCondition = {}){
    
    const payload = JSON.stringify({
      title: title,
      body: message,
      url: url,
    });

    const condition = filterCondition && typeof filterCondition === "object" ? filterCondition : {};

    const subs = await subscribeModel.find(condition);

    for (const s of subs) {
      try {
        await webpush.sendNotification(s.subscription, payload);
      } 
      catch (err) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await subscribeModel.deleteOne({ endpoint: s.endpoint });
        } 
        else {
          console.log("push error:", err?.statusCode, err?.message);
        }
      }
    }
}

module.exports = {
    router,
    pushNotification
};
