const { Sequelize, QueryTypes } = require('sequelize');
const path = require('path');

const db = path.join(
  process.env.USERPROFILE || '',
  'Documents',
  'chatgpt-on-cs',
  'msg.db',
);
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: db,
  logging: false,
});

const newReply =
  '亲，给您添麻烦了。麻烦您拍几张破损的照片发我，我这边马上帮您处理。[or]不好意思出现这个问题。方便发一下损坏位置的照片吗？我好尽快帮您处理。[or]亲，抱歉给您带来不便。请发几张破损照片过来，我这边帮您跟进处理。';

(async () => {
  const before = await sequelize.query(
    "SELECT id, keyword, reply FROM keyword WHERE reply LIKE '%听闻%' OR keyword LIKE '%损坏%' OR keyword LIKE '%破损%'",
    { type: QueryTypes.SELECT },
  );
  console.log('before', JSON.stringify(before, null, 2));

  const result = await sequelize.query(
    "UPDATE keyword SET reply = :reply WHERE reply LIKE '%听闻商品有损%' OR (keyword LIKE '%损坏%' AND keyword LIKE '%破损%') OR keyword = '损坏|破损|有损|坏了'",
    { replacements: { reply: newReply } },
  );
  console.log('update result', result);

  // also update any reply containing the bad phrase
  await sequelize.query(
    "UPDATE keyword SET reply = :reply WHERE reply LIKE '%听闻商品有损%' OR reply LIKE '%进行下一步处理%'",
    { replacements: { reply: newReply } },
  );

  const after = await sequelize.query(
    "SELECT id, keyword, reply FROM keyword WHERE keyword LIKE '%损坏%' OR keyword LIKE '%破损%' OR reply LIKE '%破损的照片%'",
    { type: QueryTypes.SELECT },
  );
  console.log('after', JSON.stringify(after, null, 2));
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
