import { PAYMENT_ASSETS } from './paymentAssets';

export const PAYMENT_CONFIG = {
  bancolombia: {
    account_number: "108-859265-21",
    key: "0089823116",
    type: "Ahorros",
    logo: PAYMENT_ASSETS.bancolombia
  },
  nequi: {
    number: "310 374 1536",
    logo: PAYMENT_ASSETS.nequi
  },
  breb: {
    key: "310 374 1536",
    logo: PAYMENT_ASSETS.daviplata
  },
  beneficiary: {
    name: "Bancolombia: Carlos Humberto Parra Franco · Nequi/Daviplata: Orlando Acosta"
  },
  whatsapp: {
    official_number: "573212762761",
    logo: PAYMENT_ASSETS.whatsapp
  }
};
