# Neo AI Control — AWS connection (single account & organization-wide)

Neo verifies AWS control evidence **read-only**, cross-account, with **no access keys**. You create
an IAM role that trusts Neo's account and is gated by a unique **External ID**; Neo assumes it with
`sts:AssumeRole`. The role carries the AWS-managed **SecurityAudit** policy (Basic) plus, in
**Enhanced** mode, a tiny Neo supplemental read-only policy for Bedrock AI inventory. Nothing is ever
written, created, or deleted in your environment.

## Why SecurityAudit (not a per-service list)
SecurityAudit is the AWS-managed, auto-updated policy purpose-built for security/audit tooling. Neo
never maintains a list of individual service permissions — AWS keeps SecurityAudit current as new
services ship. Enhanced adds only the handful of `bedrock:List*/Get*` reads SecurityAudit lags on.

## Option A — Single account (quick start)
1. In Neo → Integrations → AWS, start a connection. Neo shows your **External ID** and **Neo account id**.
2. Deploy `neo-aws-readonly-role.yaml` (CloudFormation) in the account, passing `NeoAccountId`,
   `ExternalId`, and `VerificationMode=Enhanced`.
3. Paste the stack output **RoleArn** back into Neo. Done.

## Option B — Organization-wide (recommended for enterprises)
Enterprises run many accounts. Deploy the role **once** from the Organizations **management account**
via a **CloudFormation StackSet** with **service-managed permissions** and **auto-deployment ON** — so
every current *and future* member account inherits the same role + External ID automatically.

1. Enable trusted access for CloudFormation StackSets in AWS Organizations (one-time).
2. Create a StackSet from `neo-aws-readonly-role.yaml`:
   - Permission model: **Service-managed**.
   - Auto-deployment: **Enabled** (new accounts get the role automatically).
   - Parameters: `NeoAccountId`, `ExternalId` (one shared External ID for the org), `VerificationMode=Enhanced`.
   - Deployment targets: the **organization root** (or specific OUs).
   ```
   aws cloudformation create-stack-set \
     --stack-set-name NeoControlReadOnlyVerifier \
     --template-body file://neo-aws-readonly-role.yaml \
     --capabilities CAPABILITY_NAMED_IAM \
     --permission-model SERVICE_MANAGED \
     --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
     --parameters ParameterKey=NeoAccountId,ParameterValue=<NEO_ACCT> \
                  ParameterKey=ExternalId,ParameterValue=<EXTERNAL_ID> \
                  ParameterKey=VerificationMode,ParameterValue=Enhanced

   aws cloudformation create-stack-instances \
     --stack-set-name NeoControlReadOnlyVerifier \
     --deployment-targets OrganizationalUnitIds=<ROOT_OR_OU_ID> \
     --regions us-east-1
   ```
3. In Neo, connect at the **organization level**: provide the management account id + External ID.
   Neo lists member accounts (via `organizations:ListAccounts` from the management-account role) and
   assumes `NeoControlReadOnlyVerifierRole` in each, running checks per account and rolling evidence
   up to each control objective. New accounts are picked up automatically on the next scan.

> The role name is identical in every account (`NeoControlReadOnlyVerifierRole`), so Neo derives each
> account's role ARN as `arn:aws:iam::<accountId>:role/NeoControlReadOnlyVerifierRole` — no per-account
> configuration in Neo.

## What Neo can and cannot do with this role
- **Can:** list/describe configuration and posture — CloudTrail, Config, IAM, KMS, S3 access settings,
  GuardDuty, and (Enhanced) Bedrock model/guardrail inventory.
- **Cannot:** read object/data contents, and cannot write, create, modify, or delete anything.
