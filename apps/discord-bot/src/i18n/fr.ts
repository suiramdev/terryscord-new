export const frTranslations = {
  "captcha.errors.adminRequired":
    "Vous devez avoir la permission administrateur pour gerer les parametres captcha.",
  "captcha.errors.botMemberUnavailable":
    "Impossible de charger mes informations de membre bot dans ce serveur. Reessayez.",
  "captcha.errors.categoryIdInvalid":
    "L'ID de categorie fourni est invalide ou n'appartient pas a une categorie de ce serveur.",

  "captcha.errors.categoryManagePermission":
    "J'ai besoin de la permission `Gerer les salons` dans cette categorie pour creer des salons captcha.",
  "captcha.errors.categoryViewPermission":
    "Je dois pouvoir voir cette categorie pour y creer des salons captcha.",

  "captcha.errors.channelFormatLength":
    "Le format de nom de salon doit contenir entre 3 et 80 caracteres.",
  "captcha.errors.codeLengthRange":
    "La longueur du code doit etre comprise entre {min} et {max}.",

  "captcha.errors.debugRunDisabled":
    "`/captcha debug-run` est desactive hors mode developpement pour eviter une utilisation accidentelle en production.",
  "captcha.errors.maxAttemptsRange":
    "Le nombre maximal d'essais doit etre compris entre {min} et {max}.",
  "captcha.errors.noiseLevelRange":
    "Le niveau de bruit doit etre compris entre {min} et {max}.",
  "captcha.errors.roleAboveBot":
    "Ce role est au-dessus de mon role le plus eleve, je ne peux donc pas l'attribuer.",
  "captcha.errors.roleEveryone":
    "Le role @everyone ne peut pas etre configure comme role verifie.",
  "captcha.errors.roleManaged":
    "Les roles geres/integration ne peuvent pas etre configures comme role verifie.",
  "captcha.errors.saveFailed":
    "Echec de l'enregistrement des parametres captcha. Verifiez la connexion a la base de donnees puis reessayez.",
  "captcha.errors.selectedCategoryNotResolved":
    "Impossible de resoudre la categorie selectionnee dans ce serveur.",
  "captcha.errors.selectedChannelNotCategory":
    "Le salon selectionne doit etre une categorie.",
  "captcha.errors.selectedRoleNotFound":
    "Impossible de trouver le role selectionne.",
  "captcha.errors.serverOnly":
    "Cette commande peut uniquement etre utilisee dans un serveur.",
  "captcha.errors.timeoutRange":
    "Le delai doit etre compris entre {min} et {max} secondes.",
  "captcha.errors.unsupportedCaptchaType":
    "Type de captcha non pris en charge. Valeurs supportees : {supported}.",
  "captcha.errors.unsupportedSetSubcommand":
    "Sous-commande de parametre captcha non prise en charge.",
  "captcha.errors.unsupportedSubcommand":
    "Sous-commande captcha non prise en charge.",
  "captcha.errors.userNotGuildMember":
    "Cet utilisateur n'est actuellement pas membre de ce serveur.",
  "captcha.show.allowAdminAccess": "Acces administrateur : {value}",
  "captcha.show.captchaCategory": "Categorie captcha : {value}",
  "captcha.show.captchaType": "Type de captcha : {value}",
  "captcha.show.caseSensitiveAnswers":
    "Reponses sensibles a la casse : {value}",
  "captcha.show.channelNameFormat": "Format du nom de salon : {value}",
  "captcha.show.codeLength": "Longueur du code : {value}",
  "captcha.show.debugLogging": "Journalisation debug : {value}",
  "captcha.show.kickOnFailure": "Expulsion en cas d'echec : {value}",
  "captcha.show.maxAttempts": "Essais max : {value}",
  "captcha.show.noiseLevel": "Niveau de bruit : {value}",
  "captcha.show.sourceDefault":
    "Aucun parametre n'est encore stocke ; les valeurs par defaut hardcodees sont actives.",
  "captcha.show.sourceStored":
    "Parametres de base de donnees charges (les valeurs de secours restent appliquees aux valeurs invalides/manquantes).",
  "captcha.show.timeoutSeconds": "Delai (secondes) : {value}",
  "captcha.show.title": "Parametres captcha :",
  "captcha.show.verifiedRole": "Role verifie : {value}",
  "captcha.success.adminAccessSet": "Acces admin aux salons captcha {value}.",
  "captcha.success.captchaTypeSet": "Type de captcha defini sur **{value}**.",
  "captcha.success.caseSensitiveSet":
    "Correspondance des reponses captcha sensible a la casse {value}.",
  "captcha.success.categorySet":
    "Categorie captcha definie sur **{categoryName}**.",
  "captcha.success.channelNameFormatUpdated":
    "Format du nom de salon mis a jour. Placeholders supportes : {username}, {userid}, {suffix}, {prefix}.",
  "captcha.success.codeLengthSet":
    "Longueur du code captcha definie sur **{value}**.",
  "captcha.success.debugLoggingSet": "Journalisation debug captcha {value}.",
  "captcha.success.debugRunStarted":
    "Workflow de verification captcha demarre pour <@{memberId}>.",
  "captcha.success.kickOnFailureSet": "Expulsion en cas d'echec {value}.",
  "captcha.success.maxAttemptsSet": "Essais max definis sur **{value}**.",
  "captcha.success.noiseLevelSet":
    "Niveau de bruit captcha defini sur **{value}**.",
  "captcha.success.resetAll":
    "Tous les parametres captcha ont ete reinitialises sur les valeurs de secours.",
  "captcha.success.resetSingle":
    "Le parametre captcha **{option}** a ete reinitialise sur son comportement par defaut de secours.",
  "captcha.success.timeoutSet": "Delai defini sur **{value}** secondes.",
  "captcha.success.verifiedRoleSet": "Role verifie defini sur <@&{roleId}>.",

  "captcha.success.workflowAlreadyActive":
    "Impossible de demarrer la verification captcha : une session est deja active pour ce membre.",
  "commands.captcha.description":
    "Gerer les parametres de verification captcha",
  "commands.captcha.groupSet.description":
    "Definir les options de configuration du captcha",
  "commands.captcha.option.category.description":
    "Categorie des salons captcha temporaires",
  "commands.captcha.option.categoryId.description": "ID du salon categorie",
  "commands.captcha.option.codeLengthValue.description":
    "Longueur du code captcha",
  "commands.captcha.option.enabledAdminAccess.description":
    "Activer ou desactiver l'acces administrateur",
  "commands.captcha.option.enabledCaseSensitive.description":
    "Activer ou desactiver la sensibilite a la casse",
  "commands.captcha.option.enabledDebugLogging.description":
    "Activer ou desactiver les journaux de debug",
  "commands.captcha.option.enabledKick.description":
    "Activer ou desactiver l'expulsion en cas d'echec",
  "commands.captcha.option.format.description":
    "Utiliser {username}, {userid}, {suffix}, {prefix}",
  "commands.captcha.option.maxAttemptsValue.description":
    "Nombre maximal d'essais",
  "commands.captcha.option.member.description":
    "Membre pour lequel lancer la verification captcha",
  "commands.captcha.option.noiseLevelValue.description":
    "Niveau de bruit de 0 (aucun) a 100 (eleve)",
  "commands.captcha.option.resetSetting.description":
    "Parametre a reinitialiser",
  "commands.captcha.option.role.description": "Role a attribuer",
  "commands.captcha.option.timeoutValue.description": "Delai en secondes",
  "commands.captcha.option.type.description": "Type de captcha",
  "commands.captcha.resetChoice.all": "Tous les parametres",
  "commands.captcha.resetChoice.allowAdminAccess": "Acces administrateur",
  "commands.captcha.resetChoice.captchaCategory": "Categorie captcha",
  "commands.captcha.resetChoice.captchaType": "Type de captcha",
  "commands.captcha.resetChoice.caseSensitive": "Sensibilite a la casse",

  "commands.captcha.resetChoice.channelNameFormat": "Format du nom de salon",
  "commands.captcha.resetChoice.codeLength": "Longueur du code",
  "commands.captcha.resetChoice.debugLogging": "Journalisation debug",
  "commands.captcha.resetChoice.kickOnFailure": "Expulsion en cas d'echec",
  "commands.captcha.resetChoice.maxAttempts": "Nombre maximal d'essais",
  "commands.captcha.resetChoice.noiseLevel": "Niveau de bruit",
  "commands.captcha.resetChoice.timeoutSeconds": "Delai (secondes)",
  "commands.captcha.resetChoice.verifiedRole": "Role verifie",
  "commands.captcha.sub.allowAdminAccess.description":
    "Activer ou desactiver la visibilite admin des salons captcha",
  "commands.captcha.sub.captchaType.description":
    "Definir le type de challenge captcha",
  "commands.captcha.sub.caseSensitive.description":
    "Activer ou desactiver la validation sensible a la casse",
  "commands.captcha.sub.category.description":
    "Definir la categorie utilisee pour les salons captcha",
  "commands.captcha.sub.categoryById.description":
    "Definir la categorie avec un ID de salon categorie",
  "commands.captcha.sub.channelNameFormat.description":
    "Definir le format de nom des salons captcha temporaires",
  "commands.captcha.sub.codeLength.description":
    "Definir la longueur du code captcha",

  "commands.captcha.sub.debugLogging.description":
    "Activer ou desactiver les logs de debug captcha",
  "commands.captcha.sub.debugRun.description":
    "Developpement uniquement : declencher le workflow captcha pour un membre existant",
  "commands.captcha.sub.kickOnFailure.description":
    "Activer ou desactiver l'expulsion des utilisateurs qui echouent",
  "commands.captcha.sub.maxAttempts.description":
    "Definir le nombre maximal d'essais captcha",
  "commands.captcha.sub.noiseLevel.description":
    "Definir le niveau de bruit captcha pour les leurres et traces",
  "commands.captcha.sub.reset.description":
    "Reinitialiser un ou plusieurs parametres captcha sur les valeurs de secours",
  "commands.captcha.sub.show.description":
    "Afficher les parametres captcha effectifs pour ce serveur",
  "commands.captcha.sub.timeout.description":
    "Definir le delai captcha en secondes",
  "commands.captcha.sub.verifiedRole.description":
    "Definir le role attribue apres un captcha reussi",
  "commands.hello.description":
    "Envoyer un message de salutation de Terryscord",
  "commands.hello.onlineMessage":
    "Bonjour depuis Terryscord. Le bot est en ligne.",
  "common.disabled": "desactive",
  "common.enabled": "active",
  "common.notConfigured": "non configure",
  "interaction.commandUnavailable":
    "Cette commande n'est pas disponible pour le moment.",
  "interaction.executionError":
    "Une erreur inattendue est survenue pendant le traitement de cette commande.",

  "verification.audit.cleanupOrphaned":
    "Nettoyage d'un salon captcha orphelin de verification",
  "verification.audit.createReason":
    "Verification captcha ({source}) pour {memberTag}",
  "verification.audit.internalError":
    "La verification captcha a echoue suite a une erreur interne",
  "verification.audit.kickReason":
    "{failureMessage} Essais utilises : {attemptsUsed}.",
  "verification.audit.removeStaleBeforeCreate":
    "Suppression d'un ancien salon de verification captcha avant d'en creer un nouveau",
  "verification.audit.roleAddReason":
    "Verification captcha terminee avec succes",
  "verification.audit.verificationComplete": "Verification captcha terminee",
  "verification.channelName.prefix": "verification",
  "verification.embed.defaultTitle": "Verification",
  "verification.image.description": "Challenge captcha",
  "verification.message.deletedVerifiedRole":
    "Verification terminee, mais le role verifie configure n'existe plus. Merci de contacter un administrateur.",
  "verification.message.failureDefault":
    "La verification s'est terminee avant d'etre completee.",
  "verification.message.failureLimit":
    "Verification echouee car vous avez depasse le nombre maximal d'essais.",
  "verification.message.failureTime":
    "Verification expiree avant qu'une reponse captcha correcte ne soit fournie.",
  "verification.message.incorrectAttemptPlural":
    "Reponse incorrecte. {attemptsRemaining} essais restants.",
  "verification.message.incorrectAttemptSingular":
    "Reponse incorrecte. {attemptsRemaining} essai restant.",
  "verification.message.internalError":
    "La verification n'a pas pu etre terminee a cause d'une erreur interne. Merci de contacter un administrateur.",
  "verification.message.missingVerifiedRole":
    "Verification terminee, mais aucun role verifie n'est configure. Demandez a un administrateur d'executer `/captcha set verified-role`.",
  "verification.message.roleAssignFailed":
    "Verification terminee, mais je n'ai pas pu attribuer le role configure. Merci de contacter un administrateur.",
  "verification.message.roleAssigned":
    "Verification terminee. Vous disposez maintenant du role <@&{roleId}>.",
  "verification.message.welcome":
    "Bienvenue <@{memberId}>. Completez la verification ci-dessous pour acceder au serveur.",
  "verification.message.welcomeTitle": "Bienvenue",
} as const;

export type TranslationKey = keyof typeof frTranslations;
