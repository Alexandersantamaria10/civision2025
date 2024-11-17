const axios = require('axios');
const mysql = require('mysql2');
require('dotenv').config();  // Charger les variables d'environnement depuis le fichier .env
const { format } = require('date-fns');

// Connexion a la base de donnees MariaDB
const db = mysql.createConnection({
  host: 'localhost',  // Utilisation de localhost pour une base de donnees locale
  user: 'root',
  password: 'admin',  // Remplacer avec ton mot de passe MariaDB
  database: 'france_travail',
});

// Identifiants client et cle secrete
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';

// Fonction pour obtenir le token d'acces
async function getAccessToken() {
  try {
    const response = await axios.post(TOKEN_URL, null, {
      params: {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'client_credentials',
        scope: 'api_offresdemploiv2 o2dsoffre'
      }
    });
    console.log('Access Token:', response.data.access_token);  // Verifier le token
    return response.data.access_token;
  } catch (error) {
    console.error('Erreur lors de la recuperation du token:', error.response ? error.response.data : error.message);
    return null;
  }
}

const API_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

// Date d'aujourd'hui en UTC au format yyyy-MM-dd
const today = format(new Date(), 'yyyy-MM-dd');

// Fonction pour recuperer les offres d'emploi
async function fetchOffers() {
  const token = await getAccessToken();
  if (!token) {
    console.log('Impossible d’obtenir le token d’acces.');
    return;
  }

  try {
    const response = await axios.get(API_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    console.log('Reponse brute de l\'API:', response.data);

    if (response.data && response.data.results) {
      // Comparer uniquement la date, sans tenir compte de l'heure
      const filteredOffers = response.data.results.filter(offer => {
        const offerDate = offer.dateCreation.split('T')[0]; // Prendre seulement la date (avant le 'T')
        return offerDate === today; // Comparer uniquement la date, sans l'heure
      });

      return filteredOffers;
    } else {
      console.log('Aucune offre trouvee.');
      return [];
    }
  } catch (error) {
    console.error('Erreur lors de la recuperation des offres :', error.response ? error.response.data : error.message);
    return [];
  }
}

// Fonction pour inserer les offres d'emploi dans la base de donnees
async function insertOffers(offers) {
  offers.forEach(offer => {
    console.log('Offre a inserer:', offer);  // Afficher les donnees avant insertion

    const offerData = {
      titre: offer.intitule,  // Remplacer 'titre' par 'intitule' pour correspondre a la structure de l'API
      localisation: offer.lieuTravail ? offer.lieuTravail.nom : null,  // Verifier si 'lieuTravail' existe
      secteur: offer.secteurActiviteLibelle,  // Ajuster selon la reponse de l'API
      date_creation: offer.dateCreation.split('T')[0],  // Extraire uniquement la date
      description: offer.description
    };

    // Inserer l'offre dans la base de donnees
    db.query('INSERT INTO offres_emploi SET ?', offerData, (err, results) => {
      if (err) {
        console.error('Erreur lors de l\'insertion de l\'offre d\'emploi:', err.message);
      } else {
        console.log('Offre d\'emploi inseree avec succes, ID:', results.insertId);
      }
    });
  });
}

// Tester l'insertion manuelle pour verifier si ca marche avec des donnees statiques
const testOffer = {
  titre: 'Developpeur Web',
  localisation: 'Paris',
  secteur: 'Informatique',
  date_creation: today,
  description: 'Developpement d\'applications web'
};

db.query('INSERT INTO offres_emploi SET ?', testOffer, (err, results) => {
  if (err) {
    console.error('Erreur lors de l\'insertion manuelle:', err.message);
  } else {
    console.log('Offre manuelle inseree avec succes, ID:', results.insertId);
  }
});

// Appeler la fonction pour recuperer les offres d'emploi du jour
fetchOffers().then(offers => {
  if (offers.length > 0) {
    console.log('Offres d\'emploi recuperees :');
    offers.forEach(offer => {
      console.log(`Titre: ${offer.intitule}, Localisation: ${offer.lieuTravail ? offer.lieuTravail.nom : 'N/A'}, Secteur: ${offer.secteurActiviteLibelle}`);
    });

    // Inserer les offres dans la base de donnees
    insertOffers(offers);
  } else {
    console.log('Aucune offre d\'emploi pour cette date.');
  }
}).finally(() => {
  db.end();  // Ferme la connexion a la base de donnees apres execution
});
