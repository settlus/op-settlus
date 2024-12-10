# Settler

Simple daemon checks tenant status and calls 'settleAll()'

```bash
make build
/build/op-settler start
```

If you need to sign with AWS KMS, use SIGN_MODE on env file.

```bash
# ./.env
...
KMS_KEY_ID=your-kms-key-id
SIGN_MODE=remote
```