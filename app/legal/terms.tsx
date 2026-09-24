// app/legal/terms.tsx  (URL: /legal/terms)
// DormDash Terms of Service. Facts such as the payment method and contact
// email live in constants/legal.ts. Have these reviewed by a lawyer in
// Jamaica before a wide launch.

import { LegalDocument, Section } from '../../components/LegalDocument';
import { LEGAL } from '../../constants/legal';

const sections: Section[] = [
  {
    title: 'What DormDash is',
    blocks: [
      { p: `${LEGAL.appName} connects students who want food and essentials from campus stores with other students ("dashers") who pick up and deliver those orders. ${LEGAL.appName} is operated by ${LEGAL.operator}, ${LEGAL.country}.` },
      { p: `${LEGAL.appName} is not a store and does not prepare food. Stores set their own menus, prices and opening hours, and are responsible for the food they sell.` },
    ],
  },
  {
    title: 'Who can use it',
    blocks: [{ list: [
      `You must be at least ${LEGAL.minimumAge} and a student or staff member of a university DormDash serves.`,
      'You must give accurate account details and keep them up to date.',
      'One account per person. You are responsible for everything done with your account, so keep your password private.',
    ] }],
  },
  {
    title: 'Ordering',
    blocks: [{ list: [
      'Prices, availability and delivery fees shown in the app come from the stores and can change. Our servers check every order against the current menu. If something is wrong or unavailable, your order may be corrected or cancelled, and the app will tell you.',
      'You can cancel an order until a dasher accepts it. After that, contact your dasher or us.',
      'Give a delivery address your dasher can actually find, and be reachable when your order arrives.',
      'Allergen information comes from the stores. If you have a serious allergy, check with the store before ordering.',
    ] }],
  },
  {
    title: 'Payment',
    blocks: [
      { p: LEGAL.paymentMethod },
      { p: `${LEGAL.appName} does not take card details or process payments inside the app. The total shown at checkout is the amount due.` },
    ],
  },
  {
    title: 'Dashers',
    blocks: [{ list: [
      'Dashers are independent students using the platform. They are not employees or agents of DormDash.',
      'When you accept an order, deliver it promptly, handle food with care, and do not open, swap or tamper with it.',
      'Go offline when you stop taking orders, so students are not left waiting.',
      'Follow campus rules and the law while delivering, including road safety rules.',
    ] }],
  },
  {
    title: 'What you must not do',
    blocks: [{ list: [
      'Place fake orders, or orders you do not intend to pay for.',
      'Change prices, tamper with the app, or try to get around our security or rate limits.',
      'Access other people\'s accounts or data, or collect data from the app with bots or scripts.',
      'Harass, threaten or discriminate against dashers, students or store staff.',
      'Use DormDash to deliver anything illegal.',
    ] }],
  },
  {
    title: 'Suspension and ending your account',
    blocks: [
      { p: 'We can deactivate an account that breaks these terms, puts others at risk, or is used for fraud. Where it is safe to do so, we will tell you why.' },
      { p: 'You can deactivate or delete your account at any time from Profile. Deleting it is permanent. The /legal/privacy explains exactly what is deleted and what is kept.' },
    ],
  },
  {
    title: 'The service',
    blocks: [
      { p: `We work to keep ${LEGAL.appName} available and accurate, but we cannot promise it will always be available, error-free, or that a dasher will always be free to take your order. We may change or stop features, including while the app is in early release.` },
    ],
  },
  {
    title: 'Responsibility',
    blocks: [
      { p: 'Nothing in these terms limits rights you have under Jamaican consumer protection law that cannot legally be limited.' },
      { p: `To the extent the law allows, ${LEGAL.operator} is not responsible for the quality or safety of food prepared by stores, for losses caused by events outside our control, or for indirect losses. Where we are responsible, our liability for any order is limited to the amount paid for that order.` },
    ],
  },
  {
    title: 'Problems and disputes',
    blocks: [
      { p: `If something goes wrong with an order, email ${LEGAL.contactEmail} with the order details and we will try to resolve it. These terms are governed by the laws of Jamaica, and the courts of Jamaica handle any dispute we cannot resolve together.` },
    ],
  },
  {
    title: 'Changes',
    blocks: [
      { p: 'If we change these terms in a way that matters, we will tell you in the app before the change applies. Continuing to use DormDash after that means you accept the new terms.' },
    ],
  },
];

export default function TermsOfService() {
  return (
    <LegalDocument
      title="Terms of Service"
      updated={LEGAL.termsUpdated}
      intro={`These terms are the agreement between you and ${LEGAL.operator} for using ${LEGAL.appName}. By creating an account or using the app, you agree to them. Please also read our /legal/privacy.`}
      sections={sections}
    />
  );
}
