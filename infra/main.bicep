targetScope = 'resourceGroup'

@description('Azure region for all development resources.')
param location string = 'westus3'

@description('Short resource-name prefix.')
param prefix string = 'hawaii-resilience'

@description('Deployment environment name.')
param environment string = 'dev'

@description('GitHub repository allowed to deploy the development backend.')
param githubRepository string = 'HAIC-2026/Ohana-Compute'

@description('GitHub Actions environment allowed to use the deployment identity.')
param githubEnvironment string = 'development'

@description('Object ID that may bootstrap secrets in the new Key Vault.')
param bootstrapPrincipalId string

@description('AKS system node virtual-machine size.')
param nodeVmSize string = 'Standard_D2s_v5'

@minValue(1)
@maxValue(3)
@description('Initial AKS system node count.')
param nodeCount int = 1

var compactPrefix = toLower(replace('${prefix}${environment}', '-', ''))
var uniqueSuffix = uniqueString(subscription().subscriptionId, resourceGroup().id)
var aksName = '${prefix}-${environment}-aks'
var acrName = take('${compactPrefix}${uniqueSuffix}', 50)
var keyVaultName = '${take(compactPrefix, 10)}-${uniqueSuffix}'
var workloadIdentityName = '${prefix}-${environment}-backend'
var deploymentIdentityName = '${prefix}-${environment}-github'
var namespace = 'hawaii-resilience'
var serviceAccountName = 'backend'

var acrPullRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)
var acrPushRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '8311e382-0749-4cb8-b61a-304f252e45ec'
)
var aksClusterAdminRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '0ab0b1a8-8aac-4efd-b8c2-3ee1fb270be8'
)
var keyVaultSecretsUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)
var keyVaultSecretsOfficerRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
)
var readerRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'acdd72a7-3385-48ef-bd42-f606fba81ae7'
)

resource workloadIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: workloadIdentityName
  location: location
}

resource deploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: deploymentIdentityName
  location: location
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource aks 'Microsoft.ContainerService/managedClusters@2024-10-01' = {
  name: aksName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'Base'
    tier: 'Free'
  }
  properties: {
    dnsPrefix: '${prefix}-${environment}'
    enableRBAC: true
    disableLocalAccounts: false
    agentPoolProfiles: [
      {
        name: 'system'
        count: nodeCount
        vmSize: nodeVmSize
        mode: 'System'
        osType: 'Linux'
        osSKU: 'AzureLinux'
        type: 'VirtualMachineScaleSets'
        enableAutoScaling: true
        minCount: 1
        maxCount: 3
      }
    ]
    aadProfile: {
      managed: true
      enableAzureRBAC: true
    }
    addonProfiles: {
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: {
          enableSecretRotation: 'true'
          rotationPollInterval: '2m'
        }
      }
    }
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      loadBalancerSku: 'standard'
      outboundType: 'loadBalancer'
    }
    autoUpgradeProfile: {
      upgradeChannel: 'patch'
    }
  }
}

resource workloadFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: workloadIdentity
  name: 'aks-backend'
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: aks.properties.oidcIssuerProfile.issuerURL
    subject: 'system:serviceaccount:${namespace}:${serviceAccountName}'
  }
}

resource githubFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploymentIdentity
  name: 'github-development'
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:environment:${githubEnvironment}'
  }
}

resource workloadKeyVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, workloadIdentity.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    principalId: workloadIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleId
  }
}

resource bootstrapKeyVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, bootstrapPrincipalId, keyVaultSecretsOfficerRoleId)
  scope: keyVault
  properties: {
    principalId: bootstrapPrincipalId
    principalType: 'User'
    roleDefinitionId: keyVaultSecretsOfficerRoleId
  }
}

resource kubeletAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, aks.id, acrPullRoleId)
  scope: acr
  properties: {
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource githubAcrPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, deploymentIdentity.id, acrPushRoleId)
  scope: acr
  properties: {
    principalId: deploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPushRoleId
  }
}

resource githubAksAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aks.id, deploymentIdentity.id, aksClusterAdminRoleId)
  scope: aks
  properties: {
    principalId: deploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: aksClusterAdminRoleId
  }
}

resource githubResourceReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deploymentIdentity.id, readerRoleId)
  scope: resourceGroup()
  properties: {
    principalId: deploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: readerRoleId
  }
}

output aksName string = aks.name
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output keyVaultName string = keyVault.name
output tenantId string = tenant().tenantId
output workloadIdentityClientId string = workloadIdentity.properties.clientId
output deploymentIdentityClientId string = deploymentIdentity.properties.clientId
output namespace string = namespace
