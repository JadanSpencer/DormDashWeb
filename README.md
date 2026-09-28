# DormDash

**Campus peer-to-peer delivery app for Jamaican universities — students order, dashers deliver, admins manage.**

DormDash connects students on the same campus. Students order food and items from local stores. Other students sign up as dashers, pick up orders, and deliver them for a fee. Everything is tracked in real time.

## Features

**Students**
- Browse stores and menus by category
- Add items to cart, place orders
- Track delivery status live on a map
- View order history and spending stats

**Dashers**
- Go online/offline (your GPS pin stays on your phone)
- See available orders in real time
- Group orders: search for 2-3 open orders at nearby stores and take them in one trip
- Accept orders and update status through delivery steps
- Built-in map showing pickup and drop-off locations

**Admin Dashboard**
- Live stats: users, orders, revenue, active dashers
- Full CRUD for stores and menu items
- User management with account deactivation
- Platform health monitoring

## Tech Stack

- **Frontend:** React Native + Expo
- **Backend & Database:** Firebase (Firestore, Auth, Storage)
- **Notifications:** Expo Push Notifications + Firebase Cloud Functions
- **Maps:** React Native Maps + Google Maps API
- **Styling:** Custom StyleSheet

## Setup

1. Clone the repo
2. Run `npm install`
3. Create `.env` file with Firebase config keys
4. Run `npx expo start`

### Firebase Requirements
- Authentication (Email/Password)
- Firestore Database
- Storage
- Cloud Functions (Blaze plan)

## Links

- **Portfolio:** [jcommerceandtech.vercel.app](https://jcommerceandtech.vercel.app)
- **LinkedIn:** [linkedin.com/in/jadan-spencer](https://linkedin.com/in/jadan-spencer)
