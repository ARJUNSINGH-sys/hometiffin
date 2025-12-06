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

// Leaflet Imports
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet Marker Icons
try {
    if (L.Icon && L.Icon.Default) {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        });
    }
} catch (e) {
    console.warn("Leaflet icon fix skipped:", e);
}

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

const MAX_DELIVERY_RADIUS_KM = 30;

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

    // Persistent Session ID for Guest Users (Fallback if Auth fails or is slow)
    const [sessionUserId] = useState(() => {
        const stored = localStorage.getItem('tiffin_session_id');
        if (stored) return stored;
        const newId = `guest_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('tiffin_session_id', newId);
        return newId;
    });

    // Initialize Firebase
    useEffect(() => {
        const initFirebase = async () => {
            // Safety timeout to ensure app loads even if Firebase hangs
            const safetyTimeout = setTimeout(() => {
                console.warn("Firebase init timed out, forcing app load");
                setLoading(false);
            }, 3000);

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
                // User created a named database 'hometiffin' in the console
                const dbInstance = getFirestore(app, 'hometiffin');
                const currentAppId = userConfig.projectId;

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
                    clearTimeout(safetyTimeout);
                    setUser(u);
                    setLoading(false);
                });

                return () => {
                    clearTimeout(safetyTimeout);
                    unsubscribe();
                };
            } catch (error) {
                console.error("Firebase init error:", error);
                clearTimeout(safetyTimeout);
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
                    <CustomerInterface db={db} userId={user?.uid || sessionUserId} appId={appId} customerPhone={customerPhone} />
                ) : (
                    <AdminInterface db={db} appId={appId} />
                )}
            </main>
        </div>
    );
}

// --- Login Screen ---
function LoginScreen({ onLogin }) {
    const [mode, setMode] = useState('select'); // 'select', 'customer-phone', 'customer-otp', 'admin-login'
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Admin Login State
    const [adminId, setAdminId] = useState('');
    const [adminPass, setAdminPass] = useState('');

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

    const handleAdminLogin = (e) => {
        e.preventDefault();
        // Static Credential Check
        if (adminId === 'home@123' && adminPass === 'tiffin&56') {
            onLogin('admin');
        } else {
            alert("Invalid Administrator Credentials");
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-100 to-orange-50 flex flex-col justify-center items-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-orange-100 relative">
                {mode !== 'select' && (
                    <button
                        onClick={() => {
                            setMode('select');
                            setOtp('');
                            setPhoneNumber('');
                            setAdminId('');
                            setAdminPass('');
                        }}
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
                                onClick={() => setMode('admin-login')}
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

                    {mode === 'admin-login' && (
                        <form onSubmit={handleAdminLogin} className="space-y-4">
                            <div className="text-left">
                                <label className="text-xs font-bold text-gray-500 uppercase">Admin ID</label>
                                <input
                                    type="text"
                                    value={adminId}
                                    onChange={(e) => setAdminId(e.target.value)}
                                    placeholder="home@123"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-800 focus:outline-none font-medium"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="text-left">
                                <label className="text-xs font-bold text-gray-500 uppercase">Password</label>
                                <input
                                    type="password"
                                    value={adminPass}
                                    onChange={(e) => setAdminPass(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-800 focus:outline-none font-medium"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                            >
                                Secure Login <ArrowRight className="w-4 h-4" />
                            </button>
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
    const [showMap, setShowMap] = useState(false);

    // Geolocation Logic
    const checkLocation = () => {
        setIsLocating(true);
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            setIsLocating(false);
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                // console.log("Auto-Detect Precision:", position.coords.accuracy);
                handleLocationSelect(latitude, longitude);
            },
            (error) => {
                alert("Unable to retrieve your location. Please use the Map option.");
                setIsLocating(false);
            },
            options
        );
    };

    const handleLocationSelect = async (lat, lng) => {
        const dist = calculateDistance(
            KITCHEN_LOCATION.lat,
            KITCHEN_LOCATION.lng,
            lat,
            lng
        );
        setLocation({ lat, lng });
        setDistance(dist);
        setIsLocating(false);
        setShowMap(false);

        // Reverse Geocoding (Get Address from Coords)
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await response.json();
            if (data && data.display_name) {
                setAddress(data.display_name);
            }
        } catch (error) {
            console.error("Error fetching address:", error);
        }
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
        // userId is now guaranteed to be present (either from Auth or Session)
        const currentUserId = userId;

        if (!db) return;

        if (!address) {
            alert("Please enter your delivery address.");
            return;
        }
        if (!distance || distance > MAX_DELIVERY_RADIUS_KM) {
            alert("We do not deliver to this location.");
            return;
        }

        setPlacingOrder(true);

        const orderData = {
            userId: currentUserId,
            customerPhone: customerPhone || "Guest",
            items: Object.entries(cart).map(([id, qty]) => {
                const item = MENU_ITEMS.find(i => i.id === parseInt(id));
                return { id, qty, name: item.name, price: item.price };
            }),
            total: getTotal(),
            location,
            distance,
            customerAddress: address,
            status: 'Pending',
            createdAt: serverTimestamp()
        };

        try {
            // DEBUG: Verify DB Connection
            console.log("Debug: Placing order to:", appId);
            // alert(`Debug: Placing order. AppID: ${appId}`); // Uncomment if console is hard to reach

            // Race the DB call with a 2-second timer for optimistic UI feel
            const MIN_LOAD_TIME = 2000;
            const startTime = Date.now();

            const dbPromise = addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderData);

            // Wait for DB call
            await dbPromise;

            // Calculate remaining time to satisfy minimum load time
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, MIN_LOAD_TIME - elapsed);

            if (remaining > 0) {
                await new Promise(resolve => setTimeout(resolve, remaining));
            }

            console.log("Order placed successfully!");
            setCart({});
            alert("Order placed! Waiting for acceptance by kitchen.");
            setActiveTab('orders'); // Switch to order history
        } catch (error) {
            console.error("Error placing order:", error);
            alert(`Failed to place order.\nError: ${error.message}\nCode: ${error.code}`);
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
                    <CustomerOrders db={db} userId={userId} appId={appId} customerPhone={customerPhone} />
                )}
            </div>

            {/* Cart & Checkout Sidebar */}
            {
                activeTab === 'menu' && (
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

                                                <div className="flex gap-2 mb-3">
                                                    <button
                                                        onClick={checkLocation}
                                                        disabled={isLocating}
                                                        className="flex-1 py-2 bg-blue-100 text-blue-700 rounded-md text-xs font-bold hover:bg-blue-200 transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        {isLocating ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
                                                        Auto-Detect
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            console.log("Map button clicked");
                                                            setShowMap(true);
                                                        }}
                                                        className="flex-1 py-2 bg-orange-100 text-orange-700 rounded-md text-xs font-bold hover:bg-orange-200 transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        <MapPin className="w-3 h-3" /> Select on Map
                                                    </button>
                                                </div>

                                                {location && (
                                                    <div className="space-y-2 mb-2">
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
                )
            }

            {/* Map Modal */}
            {
                showMap && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
                            <div className="p-4 bg-orange-600 text-white flex justify-between items-center">
                                <h3 className="font-bold">Select Delivery Location</h3>
                                <button onClick={() => setShowMap(false)} className="p-1 hover:bg-orange-700 rounded-full">
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="flex-1 relative">
                                <MapPicker
                                    center={location || KITCHEN_LOCATION}
                                    onConfirm={(lat, lng) => handleLocationSelect(lat, lng)}
                                />
                            </div>
                            <div className="p-3 bg-gray-50 text-xs text-gray-500 text-center">
                                Drag the marker or click on the map to pinpoint your location.
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}

// --- Map Picker Component ---
function MapPicker({ center, onConfirm }) {
    const [position, setPosition] = useState(center || KITCHEN_LOCATION);

    function LocationMarker() {
        const map = useMapEvents({
            click(e) {
                setPosition(e.latlng);
                map.flyTo(e.latlng, map.getZoom());
            },
        });

        return position === null ? null : (
            <Marker
                position={position}
                draggable={true}
                eventHandlers={{
                    dragend: (e) => {
                        setPosition(e.target.getLatLng());
                    },
                }}
            />
        );
    }

    return (
        <div className="h-full w-full relative">
            <MapContainer center={[center?.lat || KITCHEN_LOCATION.lat, center?.lng || KITCHEN_LOCATION.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker />
            </MapContainer>
            <button
                onClick={() => onConfirm(position.lat, position.lng)}
                className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[1000] bg-orange-600 text-white px-8 py-3 rounded-full font-bold shadow-xl hover:bg-orange-700 hover:scale-105 transition-all flex items-center gap-2"
            >
                <CheckCircle className="w-5 h-5" /> Confirm Location
            </button>
        </div>
    );
}

// --- Customer Order History ---
function CustomerOrders({ db, userId, appId, customerPhone }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;

        if (!userId && !customerPhone) {
            setLoading(false);
            return;
        }

        // In a real app, query 'where("userId", "==", userId)'
        // Here we filter client side for simplicity with the 'public' collection pattern
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(allOrders.filter(o => o.userId === userId || (customerPhone && o.customerPhone === customerPhone)));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching orders:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId, appId, customerPhone]);

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
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
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

            {/* Sidebar Stats */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-800 mb-4">Kitchen Status</h3>
                    <div className="flex items-center gap-2 text-green-600 font-medium mb-6">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        Accepting Orders
                    </div>

                    <div className="space-y-4">
                        <div className="bg-orange-50 p-4 rounded-lg">
                            <p className="text-xs text-orange-600 font-bold uppercase tracking-wide">Total Revenue</p>
                            <p className="text-2xl font-bold text-orange-900">₹{orders.reduce((acc, curr) => acc + curr.total, 0)}</p>
                        </div>

                        <div className="bg-blue-50 p-4 rounded-lg">
                            <p className="text-xs text-blue-600 font-bold uppercase tracking-wide">Active Orders</p>
                            <p className="text-2xl font-bold text-blue-900">{orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').length}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-800 mb-4">Service Zone</h3>
                    <p className="text-xs text-gray-500 mb-4">30km radius from Kitchen HQ</p>
                    <div className="aspect-square bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100 relative overflow-hidden">
                        <div className="w-40 h-40 border-2 border-dashed border-blue-300 rounded-full flex items-center justify-center bg-blue-50/50">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        </div>
                        <span className="absolute bottom-2 text-[10px] text-gray-400">Map Preview (Mock)</span>
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
