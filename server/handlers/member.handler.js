const { Client } = require("pg");

async function handleChatMemberUpdate(ctx, db) {
  const update = ctx.chatMember;
  const oldStatus = update.old_chat_member.status;
  const newStatus = update.new_chat_member.status;
  const user = update.new_chat_member.user;
  const chatId = update.chat.id;

  // A user joined
  if ((oldStatus === "left" || oldStatus === "kicked") && newStatus === "member") {
    console.log(`${user.first_name} joined chat ${chatId}`);

    // Restrict them until they accept rules
    try {
      await ctx.telegram.restrictChatMember(chatId, user.id, {
        permissions: { can_send_messages: false },
      });
    } catch (err) {
      console.error("Error restricting new member:", err.message);
    }

    // Save to group_members
    if (db) {
      try {
        await db.query(
          `INSERT INTO group_members (chat_id, user_id, first_name, joined_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (chat_id, user_id) DO UPDATE SET first_name = $3, left_at = NULL`,
          [chatId, user.id, user.first_name]
        );
      } catch (err) {
        console.error("Error saving group member:", err.message);
      }
    }

    // Send welcome + rules with Accept button
    try {
      await ctx.telegram.sendMessage(
        chatId,
        `Karibu ${user.first_name}! Please read and accept the rules:\n\n1. Be kind.\n2. No spam.\n3. English or Kiswahili only.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: "Accept rules", callback_data: `acc:${user.id}` }]],
          },
        }
      );
    } catch (err) {
      console.error("Error sending welcome message:", err.message);
    }
  }

  // A user left
  if ((oldStatus === "member" || oldStatus === "administrator") && newStatus === "left") {
    console.log(`${user.first_name} left chat ${chatId}`);
    if (db) {
      try {
        await db.query(
          `UPDATE group_members SET left_at = NOW() WHERE chat_id = $1 AND user_id = $2`,
          [chatId, user.id]
        );
      } catch (err) {
        console.error("Error updating left member:", err.message);
      }
    }
  }
}

module.exports = { handleChatMemberUpdate };