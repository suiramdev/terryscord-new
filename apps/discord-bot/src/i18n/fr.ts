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
  "captcha.errors.recreateUnverifiedFailed":
    "Impossible de relancer le captcha pour les membres non vérifiés. Vérifiez les permissions du bot puis réessayez.",
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
  "captcha.success.recreateUnverifiedStarted":
    "Relance captcha lancée pour les membres non vérifiés.\nMembres totaux: **{totalMemberCount}**\nBots ignorés: **{botMemberCount}**\nDéjà vérifiés: **{alreadyVerifiedCount}**\nNon vérifiés ciblés: **{nonVerifiedMemberCount}**\nSessions démarrées: **{startedSessionCount}**\nSessions déjà actives: **{alreadyActiveSessionCount}**",
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
  "commands.captcha.sub.recreateUnverified.description":
    "Relancer le workflow captcha pour tous les membres non vérifiés existants",
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
  "commands.embed.description":
    "Créer et envoyer un embed avec des options structurées",
  "commands.embed.option.authorIconUrl.description":
    "embed.author.iconURL (URL http/https)",

  "commands.embed.option.authorName.description":
    "embed.author.name (requis pour utiliser author.url/iconURL)",
  "commands.embed.option.authorUrl.description":
    "embed.author.url (URL http/https)",
  "commands.embed.option.channel.description": "Salon cible où publier l'embed",
  "commands.embed.option.color.description": "embed.color (hex: #5865F2)",
  "commands.embed.option.content.description":
    "Message texte hors embed (optionnel)",
  "commands.embed.option.description.description": "embed.description",
  "commands.embed.option.fieldInline.description":
    "embed.fields[{index}].inline (true/false)",
  "commands.embed.option.fieldName.description": "embed.fields[{index}].name",
  "commands.embed.option.fieldValue.description": "embed.fields[{index}].value",
  "commands.embed.option.footerIconUrl.description":
    "embed.footer.iconURL (URL http/https)",
  "commands.embed.option.footerText.description":
    "embed.footer.text (requis pour footer.iconURL)",
  "commands.embed.option.imageUrl.description":
    "embed.image.url (URL http/https)",
  "commands.embed.option.thumbnailUrl.description":
    "embed.thumbnail.url (URL http/https)",
  "commands.embed.option.timestamp.description":
    "embed.timestamp (ajoute la date/heure actuelle)",
  "commands.embed.option.title.description": "embed.title",
  "commands.embed.option.url.description":
    "embed.url (URL du titre, http/https)",
  "commands.embed.sub.send.description": "Publier l'embed dans le salon choisi",
  "commands.hello.description":
    "Envoyer un message de salutation de Terryscord",
  "commands.hello.onlineMessage":
    "Bonjour depuis Terryscord. Le bot est en ligne.",
  "commands.rolePickButton.choice.style.danger": "Danger",
  "commands.rolePickButton.choice.style.primary": "Principal",
  "commands.rolePickButton.choice.style.secondary": "Secondaire",
  "commands.rolePickButton.choice.style.success": "Succès",
  "commands.rolePickButton.description":
    "Ajouter des boutons de sélection de rôle sur un message existant",
  "commands.rolePickButton.option.channel.description":
    "Salon contenant le message à modifier",
  "commands.rolePickButton.option.emoji.description":
    "Emoji optionnel du bouton (unicode ou format <:name:id>)",
  "commands.rolePickButton.option.label.description":
    "Texte affiché sur le bouton",
  "commands.rolePickButton.option.messageId.description":
    "ID du message cible à modifier",
  "commands.rolePickButton.option.role.description":
    "Rôle attribué lorsque le bouton est cliqué",
  "commands.rolePickButton.option.style.description": "Style visuel du bouton",
  "commands.rolePickButton.sub.add.description":
    "Ajouter un Role Pick Button sur un message",
  "commands.rolePickButton.sub.remove.description":
    "Supprimer un Role Pick Button spécifique par rôle",
  "commands.rolePickButton.sub.restore.description":
    "Retirer tous les Role Pick Buttons d'un message",
  "common.disabled": "désactivé",
  "common.enabled": "activé",
  "common.notConfigured": "non configuré",
  "embed.errors.adminRequired":
    "Vous devez avoir la permission administrateur pour envoyer des embeds avec cette commande.",
  "embed.errors.authorNameRequired":
    "Vous devez renseigner `embed.author.name` si vous utilisez `embed.author.url` ou `embed.author.iconURL`.",
  "embed.errors.channelNotSendable":
    "Le salon sélectionné ne permet pas l'envoi de messages.",
  "embed.errors.emptyEmbed":
    "Aucune propriété d'embed n'a été fournie. Renseignez au moins un champ (title, description, fields, etc.).",
  "embed.errors.fieldIncomplete":
    "Le champ {index} doit inclure `name` et `value` ensemble.",
  "embed.errors.footerTextRequired":
    "Vous devez renseigner `embed.footer.text` si vous utilisez `embed.footer.iconURL`.",
  "embed.errors.invalidColor":
    "Couleur invalide. Utilisez un code hexadécimal sur 6 caractères (ex: #5865F2).",
  "embed.errors.invalidUrl":
    "URL invalide pour `{field}`. Utilisez une URL http/https valide.",
  "embed.errors.sendFailed":
    "Impossible d'envoyer l'embed dans ce salon. Vérifiez mes permissions et les paramètres fournis.",
  "embed.errors.serverOnly":
    "Cette commande peut uniquement être utilisée dans un serveur.",
  "embed.errors.unsupportedSubcommand":
    "Sous-commande embed non prise en charge.",
  "embed.success.sent":
    "Embed envoyé dans <#{channelId}>. [Ouvrir le message]({messageUrl})",
  "interaction.commandUnavailable":
    "Cette commande n'est pas disponible pour le moment.",
  "interaction.executionError":
    "Une erreur inattendue est survenue pendant le traitement de cette commande.",
  "rolePickButton.errors.adminRequired":
    "Vous devez avoir la permission administrateur pour gérer les Role Pick Buttons.",
  "rolePickButton.errors.botMemberUnavailable":
    "Impossible de charger mon membre bot sur ce serveur.",
  "rolePickButton.errors.botMissingManageRoles":
    "Je dois avoir la permission `Gérer les rôles` pour cette fonctionnalité.",
  "rolePickButton.errors.buttonAlreadyExists":
    "Un Role Pick Button pour ce rôle existe déjà sur ce message.",
  "rolePickButton.errors.buttonNotFound":
    "Aucun Role Pick Button correspondant n'a été trouvé sur ce message.",
  "rolePickButton.errors.channelNotCompatible":
    "Le salon sélectionné ne permet pas de récupérer/modifier un message compatible.",
  "rolePickButton.errors.invalidMessageId":
    "L'ID de message fourni est invalide.",
  "rolePickButton.errors.maxComponentsReached":
    "Impossible d'ajouter un bouton: la limite de composants (5 rangées x 5 boutons) est atteinte.",
  "rolePickButton.errors.messageEditFailed":
    "Échec de la mise à jour du message cible. Vérifiez que je peux encore le modifier.",
  "rolePickButton.errors.messageNotEditable":
    "Ce message ne peut pas être modifié par le bot.",
  "rolePickButton.errors.messageNotFound":
    "Message introuvable dans le salon sélectionné.",
  "rolePickButton.errors.restoreNoButtons":
    "Ce message ne contient aucun Role Pick Button à retirer.",
  "rolePickButton.errors.roleAboveBot":
    "Ce rôle est au-dessus de mon rôle le plus élevé. Je ne peux pas l'attribuer.",
  "rolePickButton.errors.roleEveryone":
    "Le rôle @everyone ne peut pas être utilisé pour un Role Pick Button.",
  "rolePickButton.errors.roleManaged":
    "Les rôles gérés/intégration ne peuvent pas être utilisés.",
  "rolePickButton.errors.roleNotFound":
    "Impossible de trouver le rôle sélectionné dans ce serveur.",
  "rolePickButton.errors.serverOnly":
    "Cette commande/fonction ne peut être utilisée que dans un serveur.",
  "rolePickButton.errors.unsupportedComponentLayout":
    "Ce message utilise un type de composant non pris en charge pour l'édition Role Pick Button.",
  "rolePickButton.errors.unsupportedSubcommand":
    "Sous-commande Role Pick Button non prise en charge.",
  "rolePickButton.interaction.alreadyAssigned":
    "Vous avez déjà le rôle <@&{roleId}>.",
  "rolePickButton.interaction.assignFailed":
    "Je n'ai pas pu attribuer ce rôle. Vérifiez mes permissions et la hiérarchie des rôles.",
  "rolePickButton.interaction.assigned": "Rôle attribué: <@&{roleId}>",
  "rolePickButton.interaction.invalidButton":
    "Ce bouton Role Pick Button est invalide ou périmé.",
  "rolePickButton.interaction.memberNotFound":
    "Impossible de charger votre membre serveur.",
  "rolePickButton.interaction.removed": "Rôle retiré: <@&{roleId}>",
  "rolePickButton.interaction.toggleFailed":
    "Je n'ai pas pu modifier ce rôle. Vérifiez mes permissions et la hiérarchie des rôles.",
  "rolePickButton.success.added":
    "Role Pick Button ajouté dans <#{channelId}> pour <@&{roleId}> (label: **{label}**).",
  "rolePickButton.success.removed":
    "Role Pick Button supprimé (éléments retirés: **{count}**).",
  "rolePickButton.success.restored":
    "Message restauré: tous les Role Pick Buttons ont été retirés (total: **{count}**).",

  "verification.audit.cleanupOrphaned":
    "Nettoyage d'un salon captcha orphelin de vérification",
  "verification.audit.createReason":
    "Vérification captcha ({source}) pour {memberTag}",
  "verification.audit.internalError":
    "La vérification captcha a échoué suite à une erreur interne",
  "verification.audit.kickReason":
    "{failureMessage} Essais utilisés : {attemptsUsed}.",
  "verification.audit.memberLeft":
    "Suppression du salon captcha après le départ du membre",
  "verification.audit.removeStaleBeforeCreate":
    "Suppression d'un ancien salon de vérification captcha avant d'en créer un nouveau",
  "verification.audit.roleAddReason":
    "Vérification captcha terminée avec succès",
  "verification.audit.verificationComplete": "Vérification captcha terminée",
  "verification.button.regenerate": "Régénérer le captcha",
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
  "verification.message.regeneratePrompt":
    "Nouveau captcha demandé <@{memberId}>. Saisissez le code affiché ci-dessous.",
  "verification.message.regenerateTitle": "Captcha régénéré",
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
