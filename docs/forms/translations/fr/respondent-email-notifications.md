---
title: Notifications email aux répondants
description: Apprenez à envoyer un email de confirmation personnalisé aux répondants après une soumission de formulaire dans Grida Forms (email vérifié CIAM requis).
keywords:
  - grida
  - forms
  - email notifications
  - respondent email
  - ciam
format: md
doc_tasks:
  - update
---

### Notifications email aux répondants

Les notifications email aux répondants vous permettent d'envoyer un **email de confirmation personnalisé** à la personne qui a soumis votre formulaire.

C'est utile pour des formulaires d'inscription ou d'enregistrement lorsque vous voulez :

- confirmer la soumission
- partager les prochaines étapes
- inclure une référence comme un identifiant de soumission

### Avant de commencer (CIAM / email vérifié)

Grida envoie des emails aux répondants **uniquement lorsque CIAM est utilisé** et que le répondant a une **adresse email vérifiée**.

Concrètement, cela signifie :

- votre formulaire doit inclure un champ `challenge_email` (vérification email CIAM)
- l'email est envoyé à l'adresse email vérifiée associée à la soumission (et non à un champ libre quelconque)

### Comment activer les notifications email aux répondants

1. Ouvrez votre **Form** dans l'éditeur Grida.
2. Dans la barre latérale gauche, cliquez sur [**Connect**](https://grida.co/_/connect).
3. Cliquez sur [**Channels**](https://grida.co/_/connect/channels).
4. Dans **Email Notifications**, trouvez **Respondent email notifications**.
5. Activez **Enable**.
6. Cliquez sur **Save**.

### Comment personnaliser l'email

1. Ouvrez [**Connect -> Channels**](https://grida.co/_/connect/channels) -> **Email Notifications** (même écran que ci-dessus).
2. Configurez les champs de l'email :
   - **Reply-To** (optionnel) : adresse où les réponses doivent être envoyées (par ex. `support@yourdomain.com`)
   - **Subject** : modèle d'objet de l'email
   - **From name** (optionnel) : nom d'affichage de l'expéditeur (par ex. `Acme Support`)
   - **Body (HTML)** : modèle du corps de l'email en HTML
3. Utilisez l'aperçu intégré pour vérifier l'objet et le contenu.
4. Cliquez sur **Save**.

### Ce qui est envoyé (vue d'ensemble)

- **Destinataire** : l'**email vérifié** du répondant (CIAM)
- **Email expéditeur** : une adresse no-reply fixe (le nom d'affichage peut être personnalisé avec **From name**)
- **Moment d'envoi** : après une soumission de formulaire réussie
  - si CIAM n'est pas présent ou si l'email n'est pas vérifié, l'envoi est ignoré

### Templates (variables Handlebars)

L'objet et le corps prennent en charge les variables de template.

#### Variables disponibles

- `{{form_title}}`
- `{{response.idx}}` (index formaté de la soumission)
- `{{fields.<field_name>}}` (champs soumis par nom de champ)

#### Exemples

Objet :

```txt
Merci pour votre inscription à {{form_title}}
```

Corps (HTML) :

```html
<h1>Merci, {{fields.first_name}} !</h1>
<p>Nous avons bien reçu votre soumission pour {{form_title}}.</p>
<p>Votre numéro d'inscription : {{response.idx}}</p>
```

### Dépannage

Si les emails ne sont pas envoyés :

- **CIAM non activé** : vérifiez que votre formulaire inclut un champ `challenge_email`
- **Email non vérifié** : le répondant doit terminer la vérification ; les emails non vérifiés sont ignorés
- **Corps du message manquant** : l'envoi est ignoré si le corps est vide
- **Fiabilité de la livraison** : l'envoi est actuellement best-effort inline. Des retries ou une file d'attente pourront être ajoutés plus tard.
