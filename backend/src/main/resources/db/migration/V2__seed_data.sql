-- Single seeded user; auth is deferred (see plan). Every user-owned row points here for now.
INSERT INTO users (email, display_name) VALUES ('sanskarrajak@gmail.com', 'Sanskar');

INSERT INTO categories (owner_id, name, is_system_default) VALUES
    (NULL, 'Food', true),
    (NULL, 'Groceries', true),
    (NULL, 'Transport', true),
    (NULL, 'Entertainment', true),
    (NULL, 'Utilities', true),
    (NULL, 'Shopping', true),
    (NULL, 'Travel', true),
    (NULL, 'Health', true),
    (NULL, 'Other', true);

INSERT INTO categories (owner_id, parent_category_id, name, is_system_default)
    SELECT NULL, id, 'Coffee', true FROM categories WHERE name = 'Food' AND owner_id IS NULL;
