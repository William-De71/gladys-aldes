# Aldes

## Présentation

Cette intégration amène dans Gladys les produits Aldes reliés à l’application **AldesConnect** : les **VMC** (InspirAIR Home, EasyHOME PureAIR Compact Connect / Premium, Dee Fly Cube) et les pompes à chaleur **T.One AIR / AquaAIR** avec leurs thermostats de pièce. Elle se connecte avec l’e-mail et le mot de passe de votre compte AldesConnect, comme l’application.

- Une **VMC** : son mode (quotidien, boost, invités, vacances, programmation), le taux de CO2, la température et l’humidité de la cuisine et de chaque salle de bain, la durée de vie restante du filtre — chaque valeur quand la VMC la transmet.
- Une **pompe à chaleur T.One** : son mode air (arrêt, chauffage confort / éco / programme A ou B, rafraîchissement confort / boost / programme C ou D), sur une AquaAIR le mode eau chaude (marche, boost, arrêt) et l’eau chaude disponible, la température principale.
- Un **thermostat** par pièce d’une T.One : sa consigne (au degré près) et la température de la pièce.
- Des déclencheurs de scène (mode changé, hors ligne, filtre à changer, vacances) et des actions de scène (mode de ventilation, boost minuté, mode air, eau chaude, vacances, relever maintenant).
- Deux widgets de tableau de bord : la VMC et la T.One.

**Transport : cloud.** Gladys ne parle jamais directement à vos produits : elle lit et écrit dans le cloud Aldes, qui transmet les commandes au produit. Un changement fait dans Gladys s’affiche tout de suite et se confirme quelques secondes plus tard ; un changement fait dans l’application, par la programmation ou sur le produit arrive dans Gladys au relevé suivant. Vos données quittent la maison (c’est déjà le cas avec l’application).

Sans lien avec Aldes. Le service utilisé est celui de l’application AldesConnect ; Aldes **ne le documente pas** et peut le changer sans préavis. Les requêtes sont celles qu’utilisent les projets de la communauté : les intégrations Aldes pour Home Assistant ([guix77/homeassistant-aldes](https://github.com/guix77/homeassistant-aldes), [saniho/homeassistant-aldes](https://github.com/saniho/homeassistant-aldes)), les plugins Homebridge et aldes2mqtt. Pas encore essayée sur un vrai compte : dites-nous ce qui marche et ce qui ne marche pas.

![Illustration générée des deux widgets : la VMC Aldes (CO2, température et humidité de la cuisine, filtre, mode, boutons Boost 30 min, Quotidien et Actualiser) et la T.One Aldes (température intérieure, eau chaude, pièces et consignes, modes air et eau chaude) — pas une capture d’écran](https://raw.githubusercontent.com/William-De71/gladys-aldes/main/docs/assets/widgets.fr.png)

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent.
- Une VMC ou une T.One Aldes déjà installée et visible dans l’application **AldesConnect**.
- Le **compte AldesConnect** : vérifiez que vous pouvez vous connecter à l’application avec votre e-mail et votre mot de passe. Aldes ne propose pas d’accès séparé pour les tiers : l’intégration utilise le mot de passe de votre compte.

## Configuration

Dans Gladys, ouvrez **Intégrations → Aldes** :

| Champ                           | Description                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| E-mail                          | L’e-mail de votre compte AldesConnect.                                                          |
| Mot de passe                    | Son mot de passe : envoyé à Aldes uniquement, gardé en mémoire, jamais réaffiché ni journalisé. |
| Intervalle de relevé            | Toutes les 1, 2, 5 ou 10 minutes (2 par défaut). Une seule requête relève tous les produits.    |
| Langue des textes des appareils | Noms des fonctionnalités et des modes, messages du bouton ; automatique par défaut.             |

Cliquez sur **Tester la connexion** : l’intégration se connecte et liste les produits et thermostats de pièce trouvés, ainsi que les produits qu’elle ne gère pas. Ouvrez ensuite l’onglet **Découverte** et ajoutez les appareils voulus : rien n’est créé sans vous.

## Utilisation

### Appareils

| Appareil              | Fonctionnalités                                                                | Remarques                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VMC                   | Mode, CO2, température et humidité de la cuisine et des salles de bain, filtre | Chaque capteur n’apparaît que si la VMC le transmet (un CO2 à 0 veut dire pas de capteur). « Vacances » dans la liste des modes garde le mode vacances jusqu’au choix d’un autre mode. |
| Pompe à chaleur T.One | Mode air, mode eau chaude, eau chaude disponible, température principale       | Eau chaude : T.One AquaAIR seulement. La liste des modes air reprend les neuf modes de l’application.                                                                                  |
| Thermostat de pièce   | Consigne, température de la pièce (et humidité si elle est mesurée)            | Au degré près, dans les limites de chauffage (ou de rafraîchissement) qu’Aldes donne pour la T.One.                                                                                    |

Un produit qu’Aldes signale **hors ligne** refuse les commandes : le cloud les accepterait, mais le produit ne les recevrait jamais.

La durée de vie du filtre se calcule à partir de l’usure transmise par Aldes (100 % − usure). Ce champ n’est pas documenté : comparez-le avec l’application la première fois.

### Widgets du tableau de bord

- **VMC Aldes** : le CO2 (vert sous 800 ppm, orange sous 1 200, rouge au-delà), la température et l’humidité de la cuisine, la durée de vie du filtre, le mode (et le mode en cours sous la programmation), la fin d’un boost, la connexion. **Boost 30 min** lance un boost puis revient au mode précédent au bout de 30 minutes, **Quotidien** revient à la ventilation quotidienne, **Actualiser** relève tout de suite. Choisissez la VMC dans les réglages du widget.
- **Aldes T.One** : la température principale, l’eau chaude disponible, les pièces avec leur température et leur consigne, les modes air et eau chaude, les vacances, la connexion, un bouton **Actualiser**. Choisissez la T.One dans les réglages du widget.

### Scènes

Déclencheurs (chacun peut se limiter à un produit) :

- **Le mode d’un produit Aldes change** : dans l’application, par sa programmation ou sur le produit (jamais un changement demandé par Gladys) ; filtre sur le nouveau mode. Le nouveau et l’ancien mode sont des variables.
- **Un produit Aldes se déconnecte ou se reconnecte** au cloud Aldes (filtre sur l’un ou l’autre).
- **Un filtre Aldes est à changer** : sa durée de vie restante descend à 10 % ou moins ; une seule fois, jusqu’au changement du filtre.
- **Des vacances Aldes commencent ou finissent** : le mode vacances posé dans l’application (jamais par l’action de l’intégration) ; pour une T.One, la date de fin est une variable.

Actions :

- **Changer le mode de la VMC Aldes** : quotidien, boost, invités ou programmation, pour une VMC ou toutes.
- **Booster la VMC Aldes** : boost pendant un nombre de minutes (30 par défaut, 0 = jusqu’à un autre mode), puis retour au mode précédent. Sortie : l’heure de fin. Gladys tient le minuteur : si l’intégration redémarre entre-temps, le boost reste actif.
- **Changer le mode air de la T.One** : l’un des neuf modes.
- **Régler l’eau chaude de la T.One** : marche, boost ou arrêt (AquaAIR).
- **Poser des vacances Aldes** : dès maintenant pour un nombre de jours, ou 0 pour les annuler.
- **Relever Aldes maintenant** : le mode, le CO2, la température, l’humidité, l’eau chaude, la durée de vie du filtre et la connexion d’un produit (−1 si inconnu).

Exemples :

- Quand l’humidité de la salle de bain dépasse 75 % → booster la VMC 20 minutes.
- Quand le filtre est à changer → envoyer une notification « Filtre de la VMC : {{triggerEvent.data.filter_life}} % ».
- En partant en vacances → mode vacances pour 7 jours ; au retour → vacances à 0 jour.

### Transport

Le catalogue affiche le badge **cloud** : toutes les requêtes vont à `aldesiotsuite-aldeswebapi.azurewebsites.net`, le service de l’application AldesConnect, avec votre compte. L’application ne propose aucun accès local.

## Dépannage

- **« Aldes a refusé l’e-mail ou le mot de passe »** : vérifiez-les dans l’application AldesConnect. L’intégration réessaie toutes les 30 minutes, ou dès que vous les changez.
- **Connecté, mais aucun produit** : le compte n’a ni VMC ni T.One, ou seulement des produits que l’intégration ne gère pas encore (un chauffe-eau T.Flow, par exemple) : « Tester la connexion » les liste.
- **Une commande est refusée car le produit est hors ligne** : vérifiez le Wi-Fi du produit et sa connexion dans l’application.
- **Une commande s’annule au bout de quelques minutes** : Aldes ne l’a pas appliquée ; le tableau de bord revient à ce que dit le cloud.
- **Un capteur manque** : la VMC ne le transmet pas, ou transmet 0 (pas de capteur).
- **Le boost ne s’est pas arrêté** : l’intégration a redémarré pendant le boost ; choisissez un autre mode.
- **Plus rien ne marche après une mise à jour de l’application** : le service non documenté a peut-être changé ; signalez-le.
- Signalez un problème sur [GitHub](https://github.com/William-De71/gladys-aldes/issues) avec votre version de Gladys, la version de l’intégration, le modèle du produit et le résultat de « Tester la connexion ».
