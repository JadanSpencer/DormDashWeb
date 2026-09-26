// app/legal/privacy.tsx  (URL: /legal/privacy)
// DormDash Privacy Policy. Written from what the code actually does
// (see PWA_HANDOFF.md "Data map"). If you change what data the app collects,
// update this file in the same commit. Facts like the contact email live in
// constants/legal.ts.

import { LegalDocument, Section } from '../../components/LegalDocument';
import { LEGAL } from '../../constants/legal';


const sections: Section[] = [
  {
    title: 'The short version',
    blocks: [{ list: [
      'We collect what is needed to take, deliver and support your orders: your account details, your orders, and your location when you choose to share it.',
      'We do not sell your data, show ads, or use analytics or advertising trackers.',
      'DormDash does not use artificial intelligence on your personal data. Details are in "Artificial intelligence" below.',
      'You can delete your account and personal data yourself, inside the app, at any time.',
    ] }],
  },
  {
    title: 'What we collect',
    blocks: [
      { table: [
        ['Account details', 'Name, email address, phone number, university, your role (student, dasher or admin), and optionally your major and expected graduation year. Your password is handled by Google Firebase Authentication. We never see or store it.'],
        ['Orders', 'The store, items, quantities, prices, delivery fee, total, order status and times, the delivery address you type (for example "Block C, Room 204"), and any note you add for your dasher.'],
        ['Location at checkout', 'If you allow it, the GPS position of your phone when you place an order, so your dasher gets a map pin. If you say no, we store only the address you typed.'],
        ['Dasher location', 'Only for dashers, and only while "online" is switched on: if you allow it, your phone uses GPS to show your own position on your map. That position stays on your phone. DormDash does not send it to our servers or show it to customers. While you are online, the app tells our server that you are still available about once a minute.'],
        ['Dasher activity', 'Online status, when you were last active, vehicle type, number of deliveries, rating and earnings from deliveries.'],
        ['Notifications', 'A notification token for your device, so we can send order updates. It is removed when you sign out.'],
        ['Technical data', 'Our hosting and database provider (Google) keeps short-lived security and error logs, which can include your IP address and device type. We do not use these to track you.'],
      ] },
      { p: 'Payments: card payments are handled by WiPay on its own secure page, so we never receive your card number. From WiPay we keep the transaction reference, amount, date, whether it succeeded and the last 4 digits of the card. We also keep your DormDash token balance and a history of every change to it.' },
      { p: 'We do not collect full payment card details, contacts, photos, microphone or camera data.' },
    ],
  },
  {
    title: 'Who can see what',
    blocks: [{ list: [
      'Your dasher sees your name, your delivery address or pin, your note and the items in your order. They do not see your email or phone number.',
      'As a student, you see your dasher\'s name while they are delivering your order.',
      'Stores do not get an account in DormDash and do not receive your personal details from us.',
      'DormDash administrators can see account details and orders to run the service, handle disputes and prevent abuse.',
    ] }],
  },
  {
    title: 'Why we use it',
    blocks: [{ list: [
      'To create your account, sign you in and keep your session secure.',
      'To take orders, match them with a dasher and track them to your door.',
      'To send you updates about your order and your account.',
      'To prevent fraud and abuse, for example by checking prices on our servers and limiting how many orders one account can place in a short time.',
      'To keep records of past transactions.',
    ] }],
  },
  {
    title: 'Third parties that process your data',
    blocks: [
      { p: 'We use a small number of service providers. They process data for us under their own privacy and security terms, and not for their own advertising.' },
      { table: [
        ['Google Firebase (Google LLC)', 'Sign-in, database, server functions, website hosting and push notifications. Stores all of the data described above. Servers may be outside Jamaica, including in the United States.'],
        ['WiPay', 'Card payments. When you pay by card, you enter your card details on WiPay\'s page and WiPay receives your name, email, the amount and your card details. WiPay\'s own privacy policy applies to that.'],
        ['Google Maps (Google LLC)', 'Shows delivery maps. When a map is displayed, Google receives the coordinates being shown and may set its own cookies. Google\'s privacy policy applies to that content.'],
        ['Expo (650 Industries, Inc.)', 'Delivers push notifications to the DormDash app for iPhone and Android. Receives your device token and the text of the notification.'],
        ['ntfy (ntfy.sh)', 'Sends order alerts to the stores we work with. When a dasher accepts your paid order, the store receives the order code, the items and the dasher\'s first name. Your name, room and phone number are never sent.'],
        ['Apple, Google and browser push services', 'Deliver notifications to your device, as with any app or website that sends notifications.'],
      ] },
      { p: 'We do not use Google Analytics, advertising networks, data brokers or social media trackers.' },
    ],
  },
  {
    title: 'Artificial intelligence',
    blocks: [
      { p: 'DormDash does not use artificial intelligence to make decisions about you, to price orders, to rank you, or to read your messages or notes. We do not send your personal data to AI services.' },
      { p: 'We use AI coding assistants (such as Claude and GitHub Copilot) to help write the app\'s code. These tools work on our source code, not on your personal data. Our Firebase developer tools have Google\'s "Gemini in Firebase" assistant turned on; if we ask it for help, it can see our project\'s configuration and technical logs. We do not use it to profile users.' },
      { p: 'If we ever add an AI feature that uses your data, we will update this policy and tell you in the app before it applies to you.' },
    ],
  },
  {
    title: 'Files and uploads',
    blocks: [
      { p: 'DormDash does not currently let users upload files or photos. Our file storage is locked so it cannot be read or written through the app. If we add uploads (for example profile photos), they will be visible only as needed to provide the feature, and they will be deleted when you delete your account.' },
    ],
  },
  {
    title: 'On the web: cookies and browser storage',
    blocks: [{ list: [
      'Your browser keeps your sign-in session so you stay logged in. This is required for the app to work.',
      'We remember if you dismissed the "add to home screen" or "order alerts" messages.',
      'The app saves its own files on your device so it opens quickly and works when your connection drops. It does not save your orders or personal data offline.',
      'We set no advertising or analytics cookies. Google Maps may set cookies when a map is shown.',
    ] }],
  },
  {
    title: 'How long we keep it',
    blocks: [{ list: [
      'Account details: until you delete your account.',
      'Dasher availability: whether you are online and when you were last active, until you delete your account.',
      'Orders: kept as transaction records. When you delete your account, your name, address, GPS position and notes are removed from your past orders, leaving an anonymous record of what was bought and for how much.',
      'Technical logs: kept by Google for up to 30 days.',
    ] }],
  },
  {
    title: 'Deleting your account',
    blocks: [
      { p: 'Open Profile, scroll to Account controls and choose Delete account. You will confirm with your password. We then delete your profile, your dasher record if you have one, your sign-in account and any files you uploaded, and anonymise your past orders as described above. This happens straight away. You cannot delete your account while an order is in progress.' },
      { p: `If you cannot sign in, email ${LEGAL.contactEmail} from the address on your account and we will delete it within ${LEGAL.deletionDays} days.` },
      { p: 'You can also choose Deactivate account instead. This blocks sign-in and removes you from order matching, but keeps your data so you can come back.' },
    ],
  },
  {
    title: 'Your rights',
    blocks: [
      { p: `Under Jamaica's Data Protection Act, 2020 you can ask us for a copy of your personal data, ask us to correct it, ask us to stop processing it, and object to direct marketing. We do not send marketing messages. To make a request, email ${LEGAL.contactEmail}. We will reply within 30 days. You can also complain to the Office of the Information Commissioner in Jamaica.` },
      { p: 'You can edit your name, phone number and academic details yourself in Profile.' },
    ],
  },
  {
    title: 'How we protect it',
    blocks: [{ list: [
      'All connections use HTTPS encryption.',
      'Sign-in is handled by Firebase Authentication. Sessions expire and renew automatically, and are cancelled when an account is deactivated.',
      'Our servers re-check every order and enforce who can read and change which data.',
      'Secret keys are kept out of the app and out of our code repository.',
    ] }],
  },
  {
    title: 'Age',
    blocks: [{ p: `DormDash is for university students aged ${LEGAL.minimumAge} or older. We do not knowingly collect data from anyone younger. If you think a younger person has an account, email ${LEGAL.contactEmail}.` }],
  },
  {
    title: 'Changes and contact',
    blocks: [
      { p: 'If we change this policy in a way that matters, we will tell you in the app before the change applies. The date at the top shows the latest version.' },
      { p: `${LEGAL.appName} is operated by ${LEGAL.operator}, ${LEGAL.country}. Questions: ${LEGAL.contactEmail}. See also our /legal/terms.` },
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      title="Privacy Policy"
      updated={LEGAL.privacyUpdated}
      intro={`This policy explains what personal data ${LEGAL.appName} collects, why, who it is shared with, and how you control it. It covers the ${LEGAL.appName} app for iPhone and Android and the ${LEGAL.appName} website and web app.`}
      sections={sections}
    />
  );
}
