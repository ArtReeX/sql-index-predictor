```ts
import SqlIndexPredictor from "./index";

const indexes1 = new SqlIndexPredictor().predictIndexes(
  `select "chats".*, "chats"."name" = 'General' as "is_general_channel", "chats"."type" = 'CASE_GROUP' as "is_case_group", (select GREATEST(MAX("messages"."created_at"), "chats"."created_at") from "chat_messages" as "messages" where "messages"."chat_id" = "chats"."id" limit 1) as "last_message_date", (select COUNT("messages"."id")::int from "chat_messages" as "messages" where "messages"."chat_id" = "chats"."id" and exists (select "receivers".* from "chat_messages_to_accounts" as "receivers" where "receivers"."message_id" = "messages"."id" and "receiver_id" = '3' and "receiver_read" = false) and not exists (select "meeting".* from "meetings" as "meeting" where "meeting"."id" = "messages"."meeting_id" and not "organizer_id" = '3') and "messages"."unix_ts" > (select "cleared_unix_ts" from "accounts_to_chats" as "accounts_map" where "accounts_map"."chat_id" = "chats"."id" and "account_id" = '3' limit 1) limit 1) as "unread_count", (select "cleared_unix_ts" from "accounts_to_chats" as "accounts_map" where "accounts_map"."chat_id" = "chats"."id" and "account_id" = '3' limit 1) as "cleared_unix_ts", (select "muted_until" from "accounts_to_chats" as "accounts_map" where "accounts_map"."chat_id" = "chats"."id" and "account_id" = '3' limit 1) as "muted_until" from "chats" where "chats"."type" in ('DIALOGUE', 'PATIENT_DIALOGUE') and exists (select "accounts_map".* from "accounts_to_chats" as "accounts_map" where "accounts_map"."chat_id" = "chats"."id" and "accounts_map"."account_id" = '3') and (exists (select "case".* from "cases" as "case" where "case"."id" = "chats"."case_id" and "case"."deleted_at" is null and "case"."status" in ('ACTIVE', 'LOCKED')) or "chats"."case_id" is null) and ((exists (select "case".* from "cases" as "case" where "case"."id" = "chats"."case_id" and "case"."deleted_at" is null and "case"."owner_id" = '3') or "chats"."case_id" is null) or (exists (select "case".* from "cases" as "case" where "case"."id" = "chats"."case_id" and "case"."deleted_at" is null and not "case"."owner_id" = '3') or "chats"."case_id" is null)) order by "is_general_channel" desc, "is_case_group" desc, "last_message_date" DESC NULLS LAST`
);

const indexes2 = new SqlIndexPredictor().predictIndexes(
  `SELECT *
  FROM users
  WHERE (state = 'California' AND supplier_id <> 900)
  OR (supplier_id = 100);`
);

const indexes3 = new SqlIndexPredictor().predictIndexes(
  `SELECT *
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  JOIN products p ON o.product_id = p.id
  JOIN suppliers s ON p.supplier_id = s.id
  WHERE EXISTS (
      SELECT 1
      FROM order_items oi
      WHERE oi.order_id = o.id
      AND oi.quantity > 5
  )
  AND c.country = 'USA'
  AND s.region = 'North America';`
);

console.log(JSON.stringify(indexes1));
// [["chats.type"],["accounts_to_chats.chat_id","accounts_to_chats.account_id"],["cases.id","cases.deleted_at","cases.status"],["chats.case_id"],["cases.id","cases.deleted_at","cases.owner_id"]]
console.log(JSON.stringify(indexes2));
// [["users.state"],["users.supplier_id"]]
console.log(JSON.stringify(indexes3));
// [["order_items.order_id","order_items.quantity"],["customers.country"],["suppliers.region"]]

``
