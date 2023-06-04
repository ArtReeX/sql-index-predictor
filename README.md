```sql
select "chats".*, "chats"."name" = 'General' as "is_general_channel", "chats"."type" = 'CASE_GROUP' as "is_case_group", (select GREATEST(MAX("messages"."created_at"), "chats"."created_at") from "chat_messages" as "messages" where "messages"."chat_id" = "chats"."id" limit 1) as "last_message_date", (select COUNT("messages"."id")::int from "chat_messages" as "messages" where "messages"."chat_id" = "chats"."id" and exists (select "receivers".* from "chat_messages_to_accounts" as "receivers" where "receivers"."message_id" = "messages"."id" and "receiver_id" = '3' and "receiver_read" = false) and not exists (select "meeting".* from "meetings" as "meeting" where "meeting"."id" = "messages"."meeting_id" and not "organizer_id" = '3') and "messages"."unix_ts" > (select "cleared_unix_ts" from "accounts_to_chats" as "accounts_map" where "accounts_map"."chat_id" = "chats"."id" and "account_id" = '3' limit 1) limit 1) as "unread_count", (select "cleared_unix_ts" from "accounts_to_chats" as "accounts_map" where "accounts_map"."chat_id" = "chats"."id" and "account_id" = '3' limit 1) as "cleared_unix_ts", (select "muted_until" from "accounts_to_chats" as "accounts_map" where "accounts_map"."chat_id" = "chats"."id" and "account_id" = '3' limit 1) as "muted_until" from "chats" where "chats"."type" in ('DIALOGUE', 'PATIENT_DIALOGUE') and exists (select "accounts_map".* from "accounts_to_chats" as "accounts_map" where "accounts_map"."chat_id" = "chats"."id" and "accounts_map"."account_id" = '3') and (exists (select "case".* from "cases" as "case" where "case"."id" = "chats"."case_id" and "case"."deleted_at" is null and "case"."status" in ('ACTIVE', 'LOCKED')) or "chats"."case_id" is null) and ((exists (select "case".* from "cases" as "case" where "case"."id" = "chats"."case_id" and "case"."deleted_at" is null and "case"."owner_id" = '3') or "chats"."case_id" is null) or (exists (select "case".* from "cases" as "case" where "case"."id" = "chats"."case_id" and "case"."deleted_at" is null and not "case"."owner_id" = '3') or "chats"."case_id" is null)) order by "is_general_channel" desc, "is_case_group" desc, "last_message_date" DESC NULLS LAST
```

```ts
import SqlIndexPredictor from "./main";

const indexes = new SqlIndexPredictor().predictIndexes(`SQL QUERY HERE`);

console.log(indexes);
```

```json
[
  [ 'showcases.status', 'showcases.description' ],
  [ 'showcases.owner_id' ],
  [ 'showcases.status' ],
  [ 'associates_accounts.status', 'associates_accounts.virtual' ],
  [ 'associates_accounts.from_id', 'associates_accounts.to_id' ],
  [
    'associates_to_categories.associate_id',
    'associate_categories.owner_id'
  ],
  [ 'associates_to_categories.associate_id' ],
  [
    'associate_categories_to_showcases.category_id',
    'associate_categories_to_showcases.showcase_id'
  ],
  [ 'departments_to_showcases.showcase_id' ],
  [
    'departments_to_accounts.department_id',
    'departments_to_accounts.account_id'
  ],
  [ 'outer_departments_organizations.showcase_id' ],
  [
    'business_account_users.business_account_id',
    'business_account_users.status',
    'business_account_users.account_id'
  ],
  [
    'departments_to_accounts.organization_id',
    'departments_to_accounts.account_id'
  ]
]
```
