

// types/index.ts
// This file defines the shape of every major piece of data in Dorm Dash
// Every screen, every database call, every component will reference these.

//---- User Roles ---------------------------------------------------------
// A union type - a UserRole can ONLY be one of three strings
// Typescript will error if you try assigning anything else
export type UserRole = 'student' | 'dasher' | 'admin';

//---- User ---------------------------------------------------------------
// Stored in firestore at: /users/{iserId}
export interface User {
    uid: string; // Firebase Auth UID - the unique ID Firebase assigns
    email: string;
    name: string;
    role: UserRole;
    phone: string;
    university: string; // Which campus they're on
    createdAt: number; // Unix timestamp - easier to sort than date objects
    isActive: boolean; // Admin can deactivate accounts without deleting
    profileImage?: string; // Optional - the ? means it might not exist
    termsAcceptedAt?: number; // when they ticked "18+ and agree" at sign-up
    termsVersion?: string;    // which Terms/Privacy date they agreed to
}

// ---- Store --------------------------------------------------------------
// Stored in firstore at: /stores/{storeId}
// Admin creates and manages these
export interface Store {
    id: string;
    name: string;
    description: string;
    image?: string;
    category: string;
    location: {
        latitude: number;
        longitude: number;
        address: string;
    };
    isOpen: boolean;
    deliveryFee: number;
    estimatedTime: string;
    rating: number;
    createdAt: number;
}

// ---- Menu Items ---------------------------------------------------------
// Stored in firestore at: /stores/{storeId}/menuItems/{itemId}
// Note: this is a SUB-COLLECTION - items live inside their store document
export interface MenuItem {
    id: string;
    storeId: string;
    name: string;
    description: string;
    price: number;
    image?: string;
    category: string;
    isAvailable: boolean;
    allergens?: string[];
}


// ---- Cart Item ---------------------------------------------------------
// Not stored in firestore - lives only in local state while ordering
export interface CartItem {
    menuItem: MenuItem;
    quantity: number;
    specialInstructions?: string;
}

// ---- Order Status ------------------------------------------------------
// The lifecycle of every order - it can ONLY be in one of these states
// Defined once in functions/src/shared.ts (shared with the server).
import type { OrderStatus, PaymentMethod, PaymentStatus, CancelReason } from '../functions/src/shared';
export type { OrderStatus, PaymentMethod, PaymentStatus, CancelReason };

// ---- Order -------------------------------------------------------------
// Stored in firestore at: /orders/{orderId}
// The most important document in the entire app
export interface Order {
    id: string;
    studentId: string;
    studentName: string;
    dasherId?: string;
    dasherName?: string;
    storeId: string;
    storeName: string;
    items: CartItem[];
    status: OrderStatus;
    totalAmount: number;
    deliveryFee: number;
    deliveryAddress: {
        latitude: number;
        longitude: number;
        label: string;
        hasGpsFix?: boolean;
    };
    createdAt: number;
    acceptedAt?: number;
    deliveredAt?: number;
    studentRating?: number;
    cancelReason?: CancelReason; // set by the server (or admin); none = the student cancelled
    verifiedAt?: number;     // set by the server after re-pricing the order
    dasherCreditedAt?: number; // set by the server once the dasher's stats are credited
    deliveryMins?: number;   // set by the server on delivery (admin dashboard average)
    // Payments (functions/src/payments.ts). Missing on orders from before payments.
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    payDeadline?: number;    // card: pay by this time after a dasher accepts
    paidAt?: number;
    studentNote?: string;
}
