---
title: Notifications email aux repondants
description: Apprenez a envoyer un email de confirmation personnalise aux repondants apres une soumission de formulaire dans Grida Forms (email verifie CIAM requis).
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

### Notifications email aux repondants

Les notifications email aux repondants vous permettent d'envoyer un **email de confirmation personnalise** a la personne qui a soumis votre formulaire.

C'est utile pour des formulaires d'inscription ou d'enregistrement lorsque vous voulez :

- confirmer la soumission
- partager les prochaines etapes
- inclure une reference comme un identifiant de soumission

### Avant de commencer (CIAM / email verifie)

Grida envoie des emails aux repondants **uniquement lorsque CIAM est utilise** et que le repondant a une **adresse email verifiee**.

Concretement, cela signifie :

- votre formulaire doit inclure un champ `challenge_email` (verification email CIAM)
- l'email est envoye a l'adresse email verifiee associee a la soumission (et non a un champ libre quelconque)

### Comment activer les notifications email aux repondants

1. Ouvrez votre **Form** dans l'editeur Grida.
2. Dans la barre laterale gauche, cliquez sur [**Connect**](https://grida.co/_/connect).
3. Cliquez sur [**Channels**](https://grida.co/_/connect/channels).
4. Dans **Email Notifications**, trouvez **Respondent email notifications**.
5. Activez **Enable**.
6. Cliquez sur **Save**.

### Comment personnaliser l'email

1. Ouvrez [**Connect -> Channels**](https://grida.co/_/connect/channels) -> **Email Notifications** (meme ecran que ci-dessus).
2. Configurez les champs de l'email :
   - **Reply-To** (optionnel) : adresse ou les reponses doivent etre envoyees (par ex. `support@yourdomain.com`)
   - **Subject** : modele d'objet de l'email
   - **From name** (optionnel) : nom d'affichage de l'expediteur (par ex. `Acme Support`)
   - **Body (HTML)** : modele du corps de l'email en HTML
3. Utilisez l'aperçu integre pour verifier l'objet et le contenu.
4. Cliquez sur **Save**.

### Ce qui est envoye (vue d'ensemble)

- **Destinataire** : l'**email verifie** du repondant (CIAM)
- **Email expediteur** : une adresse no-reply fixe (le nom d'affichage peut etre personnalise avec **From name**)
- **Moment d'envoi** : apres une soumission de formulaire reussie
  - si CIAM n'est pas present ou si l'email n'est pas verifie, l'envoi est ignore

### Templates (variables Handlebars)

L'objet et le corps prennent en charge les variables de template.

#### Variables disponibles

- `{{form_title}}`
- `{{response.idx}}` (index formate de la soumission)
- `{{fields.<field_name>}}` (champs soumis par nom de champ)

#### Exemples

Objet :

```txt
Merci pour votre inscription a {{form_title}}
```

Corps (HTML) :

```html
<h1>Merci, {{fields.first_name}} !</h1>
<p>Nous avons bien recu votre soumission pour {{form_title}}.</p>
<p>Votre numero d'inscription : {{response.idx}}</p>
```

### Depannage

Si les emails ne sont pas envoyes :

- **CIAM non active** : verifiez que votre formulaire inclut un champ `challenge_email`
- **Email non verifie** : le repondant doit terminer la verification ; les emails non verifies sont ignores
- **Corps du message manquant** : l'envoi est ignore si le corps est vide
- **Fiabilite de la livraison** : l'envoi est actuellement best-effort inline. Des retries ou une file d'attente pourront etre ajoutes plus tard.
