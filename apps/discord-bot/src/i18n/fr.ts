export const frTranslations = {
  "bulkDeleteCategoryChannels.errors.botManageChannelsRequired":
    "Je dois avoir la permission `Gérer les salons` pour supprimer les salons de cette catégorie.",
  "bulkDeleteCategoryChannels.errors.botMissingRequiredPermissions":
    "Je n'ai pas les permissions nécessaires pour exécuter cette suppression avancée.",
  "bulkDeleteCategoryChannels.errors.categoryNotFound":
    "Impossible de trouver la catégorie sélectionnée dans ce serveur.",
  "bulkDeleteCategoryChannels.errors.manageChannelsRequired":
    "Vous devez avoir la permission `Gérer les salons` pour utiliser cette commande.",
  "bulkDeleteCategoryChannels.errors.memberMissingRequiredPermissions":
    "Vous n'avez pas les permissions nécessaires pour ce type de suppression.",
  "bulkDeleteCategoryChannels.errors.noTargets":
    "Aucune cible trouvée pour cette requête de suppression.",
  "bulkDeleteCategoryChannels.errors.serverOnly":
    "Cette commande peut uniquement être utilisée dans un serveur.",
  "bulkDeleteCategoryChannels.errors.subjectNotFound":
    "Sous-commande de suppression avancée non reconnue.",
  "bulkDeleteCategoryChannels.errors.subjectRequired":
    "Vous devez fournir un sujet (ID, nom ou catégorie) pour ce type de ciblage.",
  "bulkDeleteCategoryChannels.labels.mode.all": "Tout",
  "bulkDeleteCategoryChannels.labels.mode.limit": "Limité",
  "bulkDeleteCategoryChannels.labels.scope.all": "Tout",
  "bulkDeleteCategoryChannels.labels.scope.categories": "Catégories",
  "bulkDeleteCategoryChannels.labels.scope.channels": "Salons",
  "bulkDeleteCategoryChannels.labels.scope.messages": "Messages",
  "bulkDeleteCategoryChannels.labels.subjectType.all": "Tout le serveur",
  "bulkDeleteCategoryChannels.labels.subjectType.category-id":
    "ID de catégorie",
  "bulkDeleteCategoryChannels.labels.subjectType.channel-id": "ID de salon",
  "bulkDeleteCategoryChannels.labels.subjectType.channel-name": "Nom de salon",
  "bulkDeleteCategoryChannels.labels.subjectType.parent-category":
    "Catégorie parente",
  "bulkDeleteCategoryChannels.messages.advancedConfirmationPrompt":
    "Action risquée: cette requête va supprimer des éléments de façon irréversible.\n\n{summary}\n\nConfirmez-vous l'opération ?",
  "bulkDeleteCategoryChannels.messages.advancedDeletionCompleted":
    "Suppression avancée terminée.\nMessages supprimés: **{deletedMessages}**\nSalons supprimés: **{deletedChannels}**\nCatégories supprimées: **{deletedCategories}**\nÉchecs messages: **{failedMessageBatches}**\nÉchecs salons: **{failedChannels}**\nÉchecs catégories: **{failedCategories}**",
  "bulkDeleteCategoryChannels.messages.advancedDeletionInProgress":
    "Suppression avancée en cours...",
  "bulkDeleteCategoryChannels.messages.advancedPlanSummary":
    "Scope: **{scope}**\nSujet: **{subjectType}**\nMode: **{mode}**\nCanaux de messages ciblés: **{messageChannels}**\nSalons ciblés: **{channels}**\nCatégories ciblées: **{categories}**",
  "bulkDeleteCategoryChannels.messages.confirmationPrompt":
    "Action risquée: vous allez supprimer **{channelCount}** salons dans la catégorie **{categoryName}**.\nConfirmez-vous cette suppression ?",
  "bulkDeleteCategoryChannels.messages.confirmationTimedOut":
    "Suppression annulée: délai de confirmation dépassé.",
  "bulkDeleteCategoryChannels.messages.deletionCancelled":
    "Suppression annulée.",
  "bulkDeleteCategoryChannels.messages.deletionCompleted":
    "Suppression terminée pour **{categoryName}**.\nSalons supprimés: **{deletedChannels}**\nÉchecs: **{failedChannels}**",
  "bulkDeleteCategoryChannels.messages.deletionInProgress":
    "Suppression en cours de **{channelCount}** salons dans **{categoryName}**...",
  "bulkDeleteCategoryChannels.messages.noChannelsInCategory":
    "Aucun salon à supprimer dans la catégorie **{categoryName}**.",
  "captcha.errors.adminRequired":
    "Vous devez avoir la permission administrateur pour gérer les paramètres captcha.",
  "captcha.errors.attemptAlertChannelSendPermission":
    "Je dois pouvoir envoyer des messages dans ce salon pour y publier les alertes d'essais captcha.",
  "captcha.errors.attemptAlertChannelViewPermission":
    "Je dois pouvoir voir ce salon pour y publier les alertes d'essais captcha.",
  "captcha.errors.botMemberUnavailable":
    "Impossible de charger mes informations de membre bot dans ce serveur. Réessayez.",
  "captcha.errors.categoryIdInvalid":
    "L'ID de catégorie fourni est invalide ou n'appartient pas à une catégorie de ce serveur.",

  "captcha.errors.categoryManagePermission":
    "J'ai besoin de la permission `Gérer les salons` dans cette catégorie pour créer des salons captcha.",
  "captcha.errors.categoryViewPermission":
    "Je dois pouvoir voir cette catégorie pour y créer des salons captcha.",

  "captcha.errors.channelFormatLength":
    "Le format de nom de salon doit contenir entre 3 et 80 caracteres.",
  "captcha.errors.codeLengthRange":
    "La longueur du code doit être comprise entre {min} et {max}.",

  "captcha.errors.debugRunDisabled":
    "`/captcha debug-run` est désactivé hors mode développement pour éviter une utilisation accidentelle en production.",
  "captcha.errors.maxAttemptsRange":
    "Le nombre maximal d'essais doit être compris entre {min} et {max}.",
  "captcha.errors.noiseLevelRange":
    "Le niveau de bruit doit être compris entre {min} et {max}.",
  "captcha.errors.roleAboveBot":
    "Ce rôle est au-dessus de mon rôle le plus élevé, je ne peux donc pas l'attribuer.",
  "captcha.errors.roleEveryone":
    "Le rôle @everyone ne peut pas être configuré comme rôle vérifié.",
  "captcha.errors.roleManaged":
    "Les rôles gérés/integration ne peuvent pas être configurés comme rôle vérifié.",
  "captcha.errors.saveFailed":
    "Échec de l'enregistrement des paramètres captcha. Vérifiez la connexion à la base de données puis réessayez.",
  "captcha.errors.selectedCategoryNotResolved":
    "Impossible de résoudre la catégorie sélectionnée dans ce serveur.",
  "captcha.errors.selectedChannelNotAttemptAlert":
    "Le salon d'alerte doit être un salon texte.",
  "captcha.errors.selectedChannelNotCategory":
    "Le salon sélectionné doit être une catégorie.",
  "captcha.errors.selectedRoleNotFound":
    "Impossible de trouver le rôle sélectionné.",
  "captcha.errors.serverOnly":
    "Cette commande peut uniquement être utilisée dans un serveur.",
  "captcha.errors.timeoutRange":
    "Le délai doit être compris entre {min} et {max} secondes.",
  "captcha.errors.unsupportedCaptchaType":
    "Type de captcha non pris en charge. Valeurs supportées : {supported}.",
  "captcha.errors.unsupportedSetSubcommand":
    "Sous-commande de paramètre captcha non prise en charge.",
  "captcha.errors.unsupportedSubcommand":
    "Sous-commande captcha non prise en charge.",
  "captcha.errors.userNotGuildMember":
    "Cet utilisateur n'est actuellement pas membre de ce serveur.",
  "captcha.show.allowAdminAccess": "Accès administrateur : {value}",
  "captcha.show.attemptAlertChannel": "Salon d'alerte essais : {value}",
  "captcha.show.captchaCategory": "Catégorie captcha : {value}",
  "captcha.show.captchaType": "Type de captcha : {value}",
  "captcha.show.caseSensitiveAnswers":
    "Réponses sensibles à la casse : {value}",
  "captcha.show.channelNameFormat": "Format du nom de salon : {value}",
  "captcha.show.codeLength": "Longueur du code : {value}",
  "captcha.show.debugLogging": "Journalisation debug : {value}",
  "captcha.show.kickOnFailure": "Expulsion en cas d'échec : {value}",
  "captcha.show.maxAttempts": "Seuil d'alerte essais : {value}",
  "captcha.show.noiseLevel": "Niveau de bruit : {value}",
  "captcha.show.sourceDefault":
    "Aucun paramètre n'est encore stocké ; les valeurs par défaut hardcodées sont actives.",
  "captcha.show.sourceStored":
    "Paramètres de base de données charges (les valeurs de secours restent appliquées aux valeurs invalides/manquantes).",
  "captcha.show.timeoutSeconds": "Délai (secondes) : {value}",
  "captcha.show.title": "Paramètres captcha :",
  "captcha.show.verifiedRole": "Rôle vérifié : {value}",
  "captcha.success.adminAccessSet": "Accès admin aux salons captcha {value}.",
  "captcha.success.attemptAlertChannelSet":
    "Salon d'alerte essais défini sur <#{channelId}>.",
  "captcha.success.captchaTypeSet": "Type de captcha défini sur **{value}**.",
  "captcha.success.caseSensitiveSet":
    "Correspondance des réponses captcha sensible à la casse {value}.",
  "captcha.success.categorySet":
    "Catégorie captcha définie sur **{categoryName}**.",
  "captcha.success.channelNameFormatUpdated":
    "Format du nom de salon mis à jour. Placeholders supportés : {username}, {userid}, {suffix}, {prefix}.",
  "captcha.success.codeLengthSet":
    "Longueur du code captcha définie sur **{value}**.",
  "captcha.success.debugLoggingSet": "Journalisation debug captcha {value}.",
  "captcha.success.debugRunStarted":
    "Workflow de vérification captcha démarré pour <@{memberId}>.",
  "captcha.success.kickOnFailureSet": "Expulsion en cas d'échec {value}.",
  "captcha.success.maxAttemptsSet":
    "Seuil d'alerte essais défini sur **{value}**.",
  "captcha.success.noiseLevelSet":
    "Niveau de bruit captcha défini sur **{value}**.",
  "captcha.success.resetAll":
    "Tous les paramètres captcha ont ete réinitialisés sur les valeurs de secours.",
  "captcha.success.resetSingle":
    "Le paramètre captcha **{option}** a été réinitialisé sur son comportement par défaut de secours.",
  "captcha.success.timeoutSet": "Délai défini sur **{value}** secondes.",
  "captcha.success.verifiedRoleSet": "Rôle vérifié défini sur <@&{roleId}>.",

  "captcha.success.workflowAlreadyActive":
    "Impossible de démarrér la vérification captcha : une session est déjà active pour ce membre.",
  "commands.captcha.description":
    "Gérer les paramètres de vérification captcha",
  "commands.captcha.groupSet.description":
    "Définir les options de configuration du captcha",
  "commands.captcha.option.attemptAlertChannel.description":
    "Salon recevant les alertes de tentatives captcha",
  "commands.captcha.option.category.description":
    "Catégorie des salons captcha temporaires",
  "commands.captcha.option.categoryId.description": "ID du salon catégorie",
  "commands.captcha.option.codeLengthValue.description":
    "Longueur du code captcha",
  "commands.captcha.option.enabledAdminAccess.description":
    "Activer ou désactiver l'accès administrateur",
  "commands.captcha.option.enabledCaseSensitive.description":
    "Activer ou désactiver la sensibilité à la casse",
  "commands.captcha.option.enabledDebugLogging.description":
    "Activer ou désactiver les journaux de debug",
  "commands.captcha.option.enabledKick.description":
    "Activer ou désactiver l'expulsion en cas d'échec",
  "commands.captcha.option.format.description":
    "Utiliser {username}, {userid}, {suffix}, {prefix}",
  "commands.captcha.option.maxAttemptsValue.description":
    "Nombre d'essais ratés avant alerte administrateur",
  "commands.captcha.option.member.description":
    "Membre pour lequel lancer la vérification captcha",
  "commands.captcha.option.noiseLevelValue.description":
    "Niveau de bruit de 0 (aucun) à 100 (eleve)",
  "commands.captcha.option.resetSetting.description":
    "Paramètre à réinitialiser",
  "commands.captcha.option.role.description": "Rôle à attribuer",
  "commands.captcha.option.timeoutValue.description": "Délai en secondes",
  "commands.captcha.option.type.description": "Type de captcha",
  "commands.captcha.resetChoice.all": "Tous les paramètres",
  "commands.captcha.resetChoice.allowAdminAccess": "Accès administrateur",
  "commands.captcha.resetChoice.attemptAlertChannel": "Salon d'alerte essais",
  "commands.captcha.resetChoice.captchaCategory": "Catégorie captcha",
  "commands.captcha.resetChoice.captchaType": "Type de captcha",
  "commands.captcha.resetChoice.caseSensitive": "Sensibilité à la casse",

  "commands.captcha.resetChoice.channelNameFormat": "Format du nom de salon",
  "commands.captcha.resetChoice.codeLength": "Longueur du code",
  "commands.captcha.resetChoice.debugLogging": "Journalisation debug",
  "commands.captcha.resetChoice.kickOnFailure": "Expulsion en cas d'échec",
  "commands.captcha.resetChoice.maxAttempts": "Seuil d'alerte essais",
  "commands.captcha.resetChoice.noiseLevel": "Niveau de bruit",
  "commands.captcha.resetChoice.timeoutSeconds": "Délai (secondes)",
  "commands.captcha.resetChoice.verifiedRole": "Rôle vérifié",
  "commands.captcha.sub.allowAdminAccess.description":
    "Activer ou désactiver la visibilite admin des salons captcha",
  "commands.captcha.sub.attemptAlertChannel.description":
    "Définir le salon de notification des tentatives captcha",
  "commands.captcha.sub.captchaType.description":
    "Définir le type de challenge captcha",
  "commands.captcha.sub.caseSensitive.description":
    "Activer ou désactiver la validation sensible à la casse",
  "commands.captcha.sub.category.description":
    "Définir la catégorie utilisée pour les salons captcha",
  "commands.captcha.sub.categoryById.description":
    "Définir la catégorie avec un ID de salon catégorie",
  "commands.captcha.sub.channelNameFormat.description":
    "Définir le format de nom des salons captcha temporaires",
  "commands.captcha.sub.codeLength.description":
    "Définir la longueur du code captcha",

  "commands.captcha.sub.debugLogging.description":
    "Activer ou désactiver les logs de debug captcha",
  "commands.captcha.sub.debugRun.description":
    "Développement uniquement : déclencher le workflow captcha pour un membre existant",
  "commands.captcha.sub.kickOnFailure.description":
    "Activer ou désactiver l'expulsion des utilisateurs qui échouent",
  "commands.captcha.sub.maxAttempts.description":
    "Définir le seuil d'essais ratés avant alerte admin",
  "commands.captcha.sub.noiseLevel.description":
    "Définir le niveau de bruit captcha pour les leurres et traces",
  "commands.captcha.sub.reset.description":
    "Réinitialiser un ou plusieurs paramètres captcha sur les valeurs de secours",
  "commands.captcha.sub.show.description":
    "Afficher les paramètres captcha effectifs pour ce serveur",
  "commands.captcha.sub.timeout.description":
    "Définir le délai captcha en secondes",
  "commands.captcha.sub.verifiedRole.description":
    "Définir le rôle attribué après un captcha réussi",
  "commands.deleteCategoryChannels.description":
    "Suppression avancée de messages/salons/catégories avec ciblage",
  "commands.deleteCategoryChannels.option.category.description":
    "Catégorie dont tous les salons enfants seront supprimés",
  "commands.deleteCategoryChannels.option.limit.description":
    "Limite maximale d'éléments à supprimer en mode limité",
  "commands.deleteCategoryChannels.option.mode.description":
    "Choisir suppression complète ou limitée",
  "commands.deleteCategoryChannels.option.scope.description":
    "Choisir quoi supprimer: messages, salons, catégories ou tout",
  "commands.deleteCategoryChannels.option.subject.description":
    "Sujet ciblé (ID, mention, nom de salon, etc.) selon le type choisi",
  "commands.deleteCategoryChannels.option.subjectType.description":
    "Choisir comment cibler la suppression",
  "commands.deleteCategoryChannels.sub.advanced.description":
    "Sous-commande avancée de suppression multi-cible",
  "commands.hello.description":
    "Envoyer un message de salutation de Terryscord",
  "commands.hello.onlineMessage":
    "Bonjour depuis Terryscord. Le bot est en ligne.",
  "common.disabled": "désactivé",
  "common.enabled": "activé",
  "common.notConfigured": "non configuré",
  "interaction.commandUnavailable":
    "Cette commande n'est pas disponible pour le moment.",
  "interaction.executionError":
    "Une erreur inattendue est survenue pendant le traitement de cette commande.",

  "verification.audit.cleanupOrphaned":
    "Nettoyage d'un salon captcha orphelin de vérification",
  "verification.audit.createReason":
    "Vérification captcha ({source}) pour {memberTag}",
  "verification.audit.internalError":
    "La vérification captcha a échoué suite à une erreur interne",
  "verification.audit.kickReason":
    "{failureMessage} Essais utilisés : {attemptsUsed}.",
  "verification.audit.removeStaleBeforeCreate":
    "Suppression d'un ancien salon de vérification captcha avant d'en créer un nouveau",
  "verification.audit.roleAddReason":
    "Vérification captcha terminée avec succès",
  "verification.audit.verificationComplete": "Vérification captcha terminée",
  "verification.channelName.prefix": "vérification",
  "verification.embed.defaultTitle": "Vérification",
  "verification.image.description": "Challenge captcha",
  "verification.message.attemptAlertThresholdReached":
    "<@{memberId}> a atteint **{attemptsUsed}** erreurs captcha (seuil: {threshold}) dans <#{verificationChannelId}>.",
  "verification.message.attemptAlertTitle": "Alerte captcha",
  "verification.message.deletedVerifiedRole":
    "Vérification terminée, mais le rôle vérifié configuré n'existe plus. Merci de contacter un administrateur.",
  "verification.message.failureDefault":
    "La vérification s'est terminée avant d'être complétée.",
  "verification.message.failureLimit":
    "Vérification échouée car vous avez depasse le nombre maximal d'essais.",
  "verification.message.failureTime":
    "Vérification expirée avant qu'une réponse captcha correcte ne soit fournie.",
  "verification.message.internalError":
    "La vérification n'a pas pu être terminée à cause d'une erreur interne. Merci de contacter un administrateur.",
  "verification.message.missingVerifiedRole":
    "Vérification terminée, mais aucun rôle vérifié n'est configuré. Demandez à un administrateur d'executer `/captcha set verified-role`.",
  "verification.message.retryPrompt":
    "Réponse incorrecte <@{memberId}>. Voici un nouveau captcha à résoudre.",
  "verification.message.retryTitle": "Nouvelle tentative",
  "verification.message.roleAssignFailed":
    "Vérification terminée, mais je n'ai pas pu attribuer le rôle configuré. Merci de contacter un administrateur.",
  "verification.message.roleAssigned":
    "Vérification terminée. Vous disposez maintenant du rôle <@&{roleId}>.",
  "verification.message.welcome":
    "Bienvenue <@{memberId}>. Completez la vérification ci-dessous pour acceder au serveur.",
  "verification.message.welcomeTitle": "Bienvenue",
} as const;

export type TranslationKey = keyof typeof frTranslations;
