// Neo AI Control - read-only Azure access.
// Azure has two parts: (1) an app registration (created in Entra, not ARM), and
// (2) a Reader role assignment for that app on the subscription (this Bicep).
//
// Step 1 - create the app + secret (Azure CLI):
//   az ad app create --display-name "Neo AI Control (read-only)"
//   az ad sp create --id <appId>
//   az ad app credential reset --id <appId>      # note the password (client secret)
//   # capture: tenantId (az account show), appId (clientId), password (clientSecret),
//   #          and the service principal objectId:  az ad sp show --id <appId> --query id -o tsv
//
// Step 2 - assign Reader on the subscription (this template):
//   az deployment sub create --location eastus \
//     --template-file neo-azure-readonly.bicep \
//     --parameters principalId=<spObjectId>

targetScope = 'subscription'

@description('Object id of the Neo app\'s service principal (from step 1).')
param principalId string

// Reader role definition id (built-in)
var readerRoleId = 'acdd72a7-3385-48ef-bd42-f606fba81ae7'

resource readerAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, principalId, readerRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', readerRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

output note string = 'Paste tenantId, clientId (appId), clientSecret and subscriptionId into Neo.'
