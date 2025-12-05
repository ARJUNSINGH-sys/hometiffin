import React, { useState, useEffect, useRef } from 'react';
import {
    MapPin,
    ShoppingBag,
    ChefHat,
    User,
    LogOut,
    Navigation,
    CheckCircle,
    XCircle,
    Loader2,
    Phone,
    Clock,
    Menu as MenuIcon,
    ArrowRight,
    MessageSquare
} from 'lucide-react';

// Firebase Imports
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged,
    signOut,
    signInWithCustomToken
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    updateDoc,
    doc
} from 'firebase/firestore';

// --- Configuration & Constants ---

// Default Kitchen Location (Example: Central Delhi coordinates for demo)
// You can change these to your specific kitchen coordinates in the code below
const KITCHEN_LOCATION = {
    lat: 28.5681,
    lng: 77.3817,
    address: "Home Kitchen HQ"
};

const MAX_DELIVERY_RADIUS_KM = 10;

const MENU_ITEMS = [
    { id: 1, name: "Standard Veg Thali", price: 120, desc: "Dal, Seasonal Veg, 4 Roti, Rice, Salad", veg: true },
    { id: 2, name: "Premium Veg Thali", price: 180, desc: "Paneer, Dal Makhani, Veg Pulao, 2 Naan, Sweet", veg: true },
    { id: 3, name: "Egg Curry Meal", price: 150, desc: "2 Egg Curry, Rice, 2 Paratha, Salad", veg: false },
    { id: 4, name: "Chicken Home Style", price: 220, desc: "Chicken Curry, Jeera Rice, 2 Roti, Raita", veg: false },
    { id: 5, name: "Mini Tiffin", price: 90, desc: "Dal, Rice, Aloo Jeera", veg: true },
    { id: 6, name: "Healthy Salad Bowl", price: 160, desc: "Sprouts, Corn, Paneer, Mixed Veggies", veg: true },
];

// --- Helper Functions ---

// Haversine formula to calculate distance between two coordinates in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// --- Components ---

export default function TiffinApp() {
    // State
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null); // 'admin' or 'customer'
    const [customerPhone, setCustomerPhone] = useState(null); // Store phone number
    const [view, setView] = useState('login'); // login, app
    const [loading, setLoading] = useState(true);

    // Firebase Instances
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [appId, setAppId] = useState(null);

    // Initialize Firebase
    useEffect(() => {
        const initFirebase = async () => {
            try {
                // --- FIREBASE CONFIGURATION LOGIC ---
                // 1. Try to get the environment config (for this preview window)
                const envConfig = window.__firebase_config ? JSON.parse(window.__firebase_config) : null;

                // 2. Define your specific project config (for when you deploy to Vercel/Netlify)
                const userConfig = {
                    apiKey: "AIzaSyAqtnAEs0ztHVB0EcgpgUzWJeCmLKztpis",
                    authDomain: "hometiffin-170a6.firebaseapp.com",
                    projectId: "hometiffin-170a6",
                    storageBucket: "hometiffin-170a6.firebasestorage.app",
                    messagingSenderId: "916086810108",
                    appId: "1:916086810108:web:2b8bfe82d096387b827e79",
                    measurementId: "G-7N1H0BQ1Y1"
                };

                // 3. Select the valid config. 
                // We prefer envConfig in this preview to prevent 'auth/configuration-not-found' errors 
                // caused by domain restrictions or missing auth providers in the user's project console.
                const firebaseConfig = envConfig || userConfig;

                // Prevent multiple initializations error
                let app;
                if (!getApps().length) {
                    app = initializeApp(firebaseConfig);
                } else {
                    app = getApp();
                }

                const authInstance = getAuth(app);
                const dbInstance = getFirestore(app);
                const currentAppId = window.__app_id || 'default-tiffin-app';

                setAuth(authInstance);
                setDb(dbInstance);
                setAppId(currentAppId);

                // Robust Auth Flow with Fallback
                try {
                    // Priority 1: Custom Token (Provided by environment)
                    if (window.__initial_auth_token) {
                        try {
                            await signInWithCustomToken(authInstance, window.__initial_auth_token);
                        } catch (tokenError) {
                            console.warn("Custom token auth failed, falling back to anonymous:", tokenError);
                            await signInAnonymously(authInstance);
                        }
                    }
                    // Priority 2: Anonymous Auth
                    else {
                        await signInAnonymously(authInstance);
                    }
                } catch (authError) {
                    console.error("Authentication failed:", authError);
                    // Don't stop loading here, let the UI handle the unauthenticated state if needed
                    // or retry manually
                }

                const unsubscribe = onAuthStateChanged(authInstance, (u) => {
                    setUser(u);
                    setLoading(false);
                });

                return () => unsubscribe();
            } catch (error) {
                console.error("Firebase init error:", error);
                setLoading(false);
            }
        };

        initFirebase();
    }, []);

    const handleLogin = (selectedRole, phone = null) => {
        setRole(selectedRole);
        if (phone) setCustomerPhone(phone);
        setView('app');
    };

    const handleLogout = () => {
        setRole(null);
        setCustomerPhone(null);
        setView('login');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-orange-50 flex items-center justify-center">
                <div className="text-center text-orange-600">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
                    <p className="font-semibold">Loading HomeTiffin...</p>
                </div>
            </div>
        );
    }

    if (view === 'login') {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
            {/* Navbar */}
            <nav className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-2">
                            <div className="bg-orange-500 p-2 rounded-lg">
                                <ChefHat className="text-white w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Home<span className="text-orange-600">Tiffin</span></h1>
                                <p className="text-xs text-gray-500 hidden sm:block">Homemade Goodness, Delivered</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="hidden sm:inline-block px-3 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full uppercase tracking-wider">
                                {role === 'admin' ? 'Administrator' : 'Customer'} Mode
                            </span>
                            {customerPhone && (
                                <span className="text-xs font-bold text-gray-600 hidden md:block">
                                    {customerPhone}
                                </span>
                            )}
                            <button
                                onClick={handleLogout}
                                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                title="Logout"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                {role === 'customer' ? (
                    <CustomerInterface db={db} userId={user?.uid} appId={appId} customerPhone={customerPhone} />
                ) : (
                    <AdminInterface db={db} appId={appId} />
                )}
            </main>
        </div>
    );
}

// --- Login Screen ---
function LoginScreen({ onLogin }) {
    const [mode, setMode] = useState('select'); // 'select', 'customer-phone', 'customer-otp'
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSendOtp = (e) => {
        e.preventDefault();
        if (phoneNumber.length < 10) {
            alert("Please enter a valid 10-digit mobile number");
            return;
        }
        setIsLoading(true);
        // Simulate API call delay
        setTimeout(() => {
            setIsLoading(false);
            setMode('customer-otp');
            // SIMULATED SMS
            alert(`HomeTiffin: Your OTP is 1234`);
        }, 1500);
    };

    const handleVerifyOtp = (e) => {
        e.preventDefault();
        if (otp === '1234') {
            onLogin('customer', phoneNumber);
        } else {
            alert("Invalid OTP. Please try '1234'");
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-100 to-orange-50 flex flex-col justify-center items-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-orange-100 relative">
                {mode !== 'select' && (
                    <button
                        onClick={() => { setMode('select'); setOtp(''); setPhoneNumber(''); }}
                        className="absolute top-4 left-4 text-gray-400 hover:text-gray-600 text-xs font-bold uppercase tracking-wider"
                    >
                        ← Back
                    </button>
                )}

                <div className="text-center mb-8 pt-4">
                    <div className="bg-orange-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3 transform hover:rotate-6 transition-transform">
                        <ChefHat className="text-white w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to HomeTiffin</h1>
                    <p className="text-gray-500">Delicious home-cooked meals at your doorstep.</p>
                </div>

                <div className="space-y-4">

                    {mode === 'select' && (
                        <>
                            <p className="text-sm font-medium text-gray-400 text-center uppercase tracking-widest mb-4">Select Interface</p>

                            <button
                                onClick={() => setMode('customer-phone')}
                                className="w-full flex items-center p-4 bg-white border-2 border-orange-100 rounded-xl hover:border-orange-500 hover:shadow-md transition-all group"
                            >
                                <div className="bg-orange-50 p-3 rounded-full mr-4 group-hover:bg-orange-500 transition-colors">
                                    <Phone className="w-6 h-6 text-orange-500 group-hover:text-white" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-gray-900">Customer Login</h3>
                                    <p className="text-xs text-gray-500">Login with Phone Number</p>
                                </div>
                            </button>

                            <button
                                onClick={() => onLogin('admin')}
                                className="w-full flex items-center p-4 bg-white border-2 border-gray-100 rounded-xl hover:border-gray-800 hover:shadow-md transition-all group"
                            >
                                <div className="bg-gray-50 p-3 rounded-full mr-4 group-hover:bg-gray-800 transition-colors">
                                    <ShoppingBag className="w-6 h-6 text-gray-600 group-hover:text-white" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-gray-900">Administrator Login</h3>
                                    <p className="text-xs text-gray-500">Manage orders, check radius</p>
                                </div>
                            </button>
                        </>
                    )}

                    {mode === 'customer-phone' && (
                        <form onSubmit={handleSendOtp} className="space-y-4">
                            <div className="text-left">
                                <label className="text-xs font-bold text-gray-500 uppercase">Mobile Number</label>
                                <div className="relative mt-1">
                                    <span className="absolute left-3 top-3 text-gray-500 font-medium">+91</span>
                                    <input
                                        type="tel"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                        placeholder="Enter 10 digit number"
                                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none font-medium text-lg tracking-wide"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading || phoneNumber.length < 10}
                                className="w-full py-3 bg-orange-600 text-white rounded-xl font-bold shadow-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Get OTP <ArrowRight className="w-4 h-4" /></>}
                            </button>
                        </form>
                    )}

                    {mode === 'customer-otp' && (
                        <form onSubmit={handleVerifyOtp} className="space-y-4">
                            <div className="text-center mb-6">
                                <p className="text-sm text-gray-600">OTP sent to +91 {phoneNumber}</p>
                                <button type="button" onClick={() => setMode('customer-phone')} className="text-xs text-orange-600 font-medium hover:underline">Change Number</button>
                            </div>

                            <div className="text-left">
                                <label className="text-xs font-bold text-gray-500 uppercase">Enter OTP</label>
                                <input
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    placeholder="XXXX"
                                    className="w-full p-3 text-center bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none font-bold text-2xl tracking-[0.5em]"
                                    required
                                    autoFocus
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-orange-600 text-white rounded-xl font-bold shadow-lg hover:bg-orange-700 transition-all flex items-center justify-center gap-2"
                            >
                                Verify & Login
                            </button>
                            <div className="text-center">
                                <button type="button" onClick={() => alert("OTP is 1234")} className="text-xs text-gray-400 hover:text-gray-600">Resend OTP</button>
                            </div>
                        </form>
                    )}

                </div>

                <div className="mt-8 text-center">
                    <p className="text-xs text-gray-400">
                        Secure login powered by Firebase (Simulating AWS Backend connection)
                    </p>
                </div>
            </div>
        </div>
    );
}

// --- Customer Interface ---
function CustomerInterface({ db, userId, appId, customerPhone }) {
    const [cart, setCart] = useState({});
    const [location, setLocation] = useState(null);
    const [distance, setDistance] = useState(null);
    const [isLocating, setIsLocating] = useState(false);
    const [address, setAddress] = useState('');
    const [placingOrder, setPlacingOrder] = useState(false);
    const [activeTab, setActiveTab] = useState('menu'); // menu, orders

    // Geolocation Logic
    const checkLocation = () => {
        setIsLocating(true);
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            setIsLocating(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const dist = calculateDistance(
                    KITCHEN_LOCATION.lat,
                    KITCHEN_LOCATION.lng,
                    latitude,
                    longitude
                );
                setLocation({ lat: latitude, lng: longitude });
                setDistance(dist);
                setIsLocating(false);
            },
            (error) => {
                alert("Unable to retrieve your location. Please allow location access.");
                setIsLocating(false);
            }
        );
    };

    const addToCart = (item) => {
        setCart(prev => ({
            ...prev,
            [item.id]: (prev[item.id] || 0) + 1
        }));
    };

    const removeFromCart = (item) => {
        setCart(prev => {
            const newCart = { ...prev };
            if (newCart[item.id] > 1) {
                newCart[item.id]--;
            } else {
                delete newCart[item.id];
            }
            return newCart;
        });
    };

    const getTotal = () => {
        return Object.entries(cart).reduce((total, [id, qty]) => {
            const item = MENU_ITEMS.find(i => i.id === parseInt(id));
            return total + (item.price * qty);
        }, 0);
    };

    const placeOrder = async () => {
        if (!db || !userId) return;
        if (!address) {
            alert("Please enter your delivery address.");
            return;
        }
        if (!distance || distance > MAX_DELIVERY_RADIUS_KM) {
            alert("We cannot deliver to this location. It is outside our service area.");
            return;
        }

        setPlacingOrder(true);
        try {
            const orderItems = Object.entries(cart).map(([id, qty]) => {
                const item = MENU_ITEMS.find(i => i.id === parseInt(id));
                return { ...item, qty };
            });

            const orderData = {
                userId,
                items: orderItems,
                total: getTotal(),
                status: 'Pending',
                createdAt: serverTimestamp(),
                customerLocation: location,
                customerAddress: address,
                distance: distance.toFixed(2),
                customerPhone: customerPhone, // Saving the phone number
                customerEmail: 'Phone Login User'
            };

            // Using 'public' collection so Admin can see it easily in this demo
            // In a real app, you might duplicate this to a private user collection
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderData);

            setCart({});
            setAddress('');
            alert("Order placed successfully!");
            setActiveTab('orders');
        } catch (e) {
            console.error(e);
            alert("Error placing order.");
        } finally {
            setPlacingOrder(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Menu Section */}
            <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">Daily Menu</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('menu')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'menu' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}
                        >
                            Order Food
                        </button>
                        <button
                            onClick={() => setActiveTab('orders')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'orders' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}
                        >
                            My Orders
                        </button>
                    </div>
                </div>

                {activeTab === 'menu' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {MENU_ITEMS.map(item => (
                            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mb-2 ${item.veg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {item.veg ? 'Veg' : 'Non-Veg'}
                                        </span>
                                        <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                                        <p className="text-gray-500 text-sm mt-1 mb-3">{item.desc}</p>
                                        <p className="font-bold text-orange-600">₹{item.price}</p>
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                        {cart[item.id] ? (
                                            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-1">
                                                <button onClick={() => removeFromCart(item)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-gray-600 hover:text-red-500">-</button>
                                                <span className="font-medium text-gray-900">{cart[item.id]}</span>
                                                <button onClick={() => addToCart(item)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-gray-600 hover:text-green-500">+</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => addToCart(item)}
                                                className="px-4 py-2 bg-orange-50 text-orange-600 rounded-lg font-medium text-sm hover:bg-orange-100 transition-colors"
                                            >
                                                Add
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <CustomerOrders db={db} userId={userId} appId={appId} />
                )}
            </div>

            {/* Cart & Checkout Sidebar */}
            {activeTab === 'menu' && (
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100 sticky top-24 overflow-hidden">
                        <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
                            <h3 className="font-bold flex items-center gap-2">
                                <ShoppingBag className="w-5 h-5" /> Your Cart
                            </h3>
                            <span className="text-sm bg-gray-700 px-2 py-1 rounded-md">{Object.keys(cart).length} items</span>
                        </div>

                        <div className="p-6 space-y-6">
                            {Object.keys(cart).length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <p>Your tiffin box is empty.</p>
                                    <p className="text-sm">Add some yummy food!</p>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                        {Object.entries(cart).map(([id, qty]) => {
                                            const item = MENU_ITEMS.find(i => i.id === parseInt(id));
                                            return (
                                                <div key={id} className="flex justify-between items-center text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-400">x{qty}</span>
                                                        <span className="text-gray-800 font-medium">{item.name}</span>
                                                    </div>
                                                    <span className="text-gray-900">₹{item.price * qty}</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="border-t border-gray-100 pt-4 space-y-2">
                                        <div className="flex justify-between font-bold text-lg text-gray-900">
                                            <span>Total</span>
                                            <span>₹{getTotal()}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t border-gray-100">
                                        {/* Delivery Check Section */}
                                        <div className="bg-blue-50 p-4 rounded-lg">
                                            <h4 className="font-medium text-blue-900 text-sm mb-2 flex items-center gap-2">
                                                <Navigation className="w-4 h-4" /> Delivery Check
                                            </h4>

                                            {!location ? (
                                                <button
                                                    onClick={checkLocation}
                                                    disabled={isLocating}
                                                    className="w-full py-2 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                                                    Locate Me (Verify 10km)
                                                </button>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-gray-500">Distance to Kitchen:</span>
                                                        <span className="font-bold">{distance?.toFixed(1)} km</span>
                                                    </div>
                                                    {distance <= MAX_DELIVERY_RADIUS_KM ? (
                                                        <div className="flex items-center gap-2 text-green-700 bg-green-100 px-3 py-2 rounded text-xs font-medium">
                                                            <CheckCircle className="w-4 h-4" /> Delivery Available
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-red-700 bg-red-100 px-3 py-2 rounded text-xs font-medium">
                                                            <XCircle className="w-4 h-4" /> Too far (Max 10km)
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Address Input */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Address</label>
                                            <textarea
                                                value={address}
                                                onChange={(e) => setAddress(e.target.value)}
                                                placeholder="Flat No, Building, Street..."
                                                className="w-full p-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none"
                                                rows={2}
                                            />
                                        </div>

                                        <button
                                            onClick={placeOrder}
                                            disabled={placingOrder || !distance || distance > MAX_DELIVERY_RADIUS_KM || !address}
                                            className="w-full py-3 bg-orange-600 text-white rounded-lg font-bold shadow-md hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                                        >
                                            {placingOrder ? <Loader2 className="w-5 h-5 animate-spin" /> : "Place Order"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Customer Order History ---
function CustomerOrders({ db, userId, appId }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db || !userId) return;

        // In a real app, query 'where("userId", "==", userId)'
        // Here we filter client side for simplicity with the 'public' collection pattern
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(allOrders.filter(o => o.userId === userId));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching orders:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId, appId]);

    if (loading) return <div className="p-8 text-center text-gray-500">Loading history...</div>;

    return (
        <div className="space-y-4">
            {orders.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-xl border border-gray-100">
                    <p className="text-gray-500">No past orders found.</p>
                </div>
            ) : (
                orders.map(order => (
                    <div key={order.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-bold text-gray-900">Order #{order.id.slice(-6).toUpperCase()}</span>
                                <StatusBadge status={order.status} />
                            </div>
                            <p className="text-sm text-gray-500 mb-2">
                                {order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                            </p>
                            <div className="text-xs text-gray-400 flex items-center gap-4">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(order.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                                <span>Total: ₹{order.total}</span>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

// --- Admin Interface ---
function AdminInterface({ db, appId }) {
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [db, appId]);

    const updateStatus = async (orderId, newStatus) => {
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderId), {
                status: newStatus
            });
        } catch (e) {
            console.error("Error updating status:", e);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Orders Feed */}
            <div className="lg:col-span-2 space-y-6">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <MenuIcon className="w-6 h-6" /> Incoming Orders
                </h2>

                <div className="space-y-4">
                    {orders.map(order => (
                        <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                            <Phone className="w-5 h-5 text-gray-500" />
                                            {order.customerPhone || order.customerEmail}
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> {order.distance} km away
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <StatusBadge status={order.status} />
                                        <span className="text-xs text-gray-400">
                                            {order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleTimeString() : 'Just now'}
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Order Details</h4>
                                    <ul className="space-y-2">
                                        {order.items.map((item, idx) => (
                                            <li key={idx} className="flex justify-between text-sm">
                                                <span>{item.qty}x {item.name}</span>
                                                <span className="text-gray-600">₹{item.price * item.qty}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="border-t border-gray-200 mt-3 pt-2 flex justify-between font-bold text-gray-900">
                                        <span>Total Bill</span>
                                        <span>₹{order.total}</span>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                                    <div className="flex gap-2 text-sm text-blue-900">
                                        <Navigation className="w-4 h-4 mt-0.5" />
                                        <div>
                                            <p className="font-semibold">Delivery Address:</p>
                                            <p>{order.customerAddress}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-3 flex justify-end gap-3 border-t border-gray-100">
                                {order.status === 'Pending' && (
                                    <>
                                        <button
                                            onClick={() => updateStatus(order.id, 'Preparing')}
                                            className="px-4 py-2 bg-yellow-100 text-yellow-700 text-sm font-medium rounded-lg hover:bg-yellow-200"
                                        >
                                            Start Preparing
                                        </button>
                                        <button
                                            onClick={() => updateStatus(order.id, 'Cancelled')}
                                            className="px-4 py-2 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200"
                                        >
                                            Reject
                                        </button>
                                    </>
                                )}
                                {order.status === 'Preparing' && (
                                    <button
                                        onClick={() => updateStatus(order.id, 'Out for Delivery')}
                                        className="px-4 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-200"
                                    >
                                        Send for Delivery
                                    </button>
                                )}
                                {order.status === 'Out for Delivery' && (
                                    <button
                                        onClick={() => updateStatus(order.id, 'Delivered')}
                                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 shadow-sm"
                                    >
                                        Mark Delivered
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {orders.length === 0 && (
                        <div className="bg-white p-12 text-center rounded-xl border border-gray-200 border-dashed">
                            <p className="text-gray-400 font-medium">No orders yet.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Admin Stats Sidebar */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-4">Kitchen Status</h3>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm text-green-700 font-medium">Accepting Orders</span>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-orange-50 rounded-lg">
                            <p className="text-xs text-orange-600 uppercase font-bold">Total Revenue</p>
                            <p className="text-2xl font-bold text-gray-900">
                                ₹{orders.reduce((acc, curr) => acc + curr.total, 0)}
                            </p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-lg">
                            <p className="text-xs text-blue-600 uppercase font-bold">Active Orders</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {orders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled').length}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-2">Service Zone</h3>
                    <p className="text-sm text-gray-500 mb-4">10km radius from Connaught Place</p>
                    {/* Mock Map View */}
                    <div className="aspect-square bg-gray-100 rounded-lg relative overflow-hidden flex items-center justify-center border border-gray-300">
                        <div className="absolute inset-0 bg-opacity-10 bg-blue-500 rounded-full scale-75 border-2 border-blue-300 border-dashed"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-4 h-4 bg-red-500 rounded-full shadow-lg border-2 border-white z-10"></div>
                        </div>
                        <p className="absolute bottom-2 text-xs text-gray-500 bg-white/80 px-2 py-1 rounded">Map Preview (Mock)</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }) {
    const styles = {
        'Pending': 'bg-gray-100 text-gray-600',
        'Preparing': 'bg-yellow-100 text-yellow-700',
        'Out for Delivery': 'bg-blue-100 text-blue-700',
        'Delivered': 'bg-green-100 text-green-700',
        'Cancelled': 'bg-red-100 text-red-700',
    };

    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border border-transparent ${styles[status] || styles['Pending']}`}>
            {status}
        </span>
    );
}
