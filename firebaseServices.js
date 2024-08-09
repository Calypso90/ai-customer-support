import {
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

export const createNewChat = async (title = "New Chat") => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const chatRef = await addDoc(collection(db, "users", user.uid, "chats"), {
    title: title,
    lastUpdated: serverTimestamp(),
    messages: [],
  });

  return chatRef.id;
};

export const addMessageToChat = async (chatId, content, role) => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const chatRef = doc(db, "users", user.uid, "chats", chatId);
  const messagesRef = collection(chatRef, "messages");

  const newMessage = {
    content,
    role,
    timestamp: serverTimestamp(),
  };

  const docRef = await addDoc(messagesRef, newMessage);

  await setDoc(chatRef, { lastUpdated: serverTimestamp() }, { merge: true });

  return {
    id: docRef.id,
    ...newMessage,
    timestamp: new Date(), // Return a JavaScript Date object for immediate use
  };
};

export const getChatMessages = async (chatId) => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const chatRef = doc(db, "users", user.uid, "chats", chatId);
  const messagesRef = collection(chatRef, "messages");
  
  const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));
  const querySnapshot = await getDocs(messagesQuery);
  
  const messages = querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      content: data.content,
      role: data.role,
      timestamp: data.timestamp instanceof Timestamp 
        ? data.timestamp.toDate() 
        : new Date(data.timestamp),
    };
  });

  return messages;
};

export const deleteChat = async (chatId) => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const chatRef = doc(db, "users", user.uid, "chats", chatId);
  await deleteDoc(chatRef);
};

export const saveChat = async (chatId, messages) => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const chatRef = doc(db, "users", user.uid, "chats", chatId);

  // Get the first message content for the title
  const title =
    messages.length > 0
      ? messages[0].content.split(" ").slice(0, 5).join(" ") + "..."
      : "New Chat";

  await setDoc(
    chatRef,
    {
      isSaved: true,
      title: title,
      lastUpdated: serverTimestamp(),
    },
    { merge: true }
  );

  // Save messages to subcollection
  const messagesRef = collection(chatRef, "messages");

  // Delete existing messages
  const existingMessages = await getDocs(messagesRef);
  existingMessages.forEach(async (doc) => {
    await deleteDoc(doc.ref);
  });

  // Add new messages
  for (const message of messages) {
    await addDoc(messagesRef, {
      content: message.content,
      role: message.role,
      timestamp:
        message.timestamp instanceof Date
          ? Timestamp.fromDate(message.timestamp)
          : serverTimestamp(),
    });
  }
};

export const getSavedChats = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in");

  const chatsRef = collection(db, "users", user.uid, "chats");
  try {
    const chatsQuery = query(
      chatsRef,
      where("isSaved", "==", true),
      orderBy("lastUpdated", "desc")
    );
    const querySnapshot = await getDocs(chatsQuery);
    const chats = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return chats;
  } catch (error) {
    console.error("Error fetching saved chats:", error);
    // If the index isn't ready, fall back to fetching all chats and filtering client-side
    if (error.code === "failed-precondition") {
      const allChatsSnapshot = await getDocs(chatsRef);
      const allChats = allChatsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      return allChats
        .filter((chat) => chat.isSaved)
        .sort((a, b) => b.lastUpdated - a.lastUpdated);
    }
    throw error;
  }
};
