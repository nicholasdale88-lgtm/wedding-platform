-- Finding a payment (or any action) by what it was about, e.g. a Stripe session already applied.
CREATE INDEX audit_action_target ON audit (action, target);
