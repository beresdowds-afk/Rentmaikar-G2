import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type UserType = "driver" | "owner" | "admin" | "admin_assistant" | null;

interface UserTypeContextType {
  userType: UserType;
  setUserType: (type: UserType) => void;

  isDriver: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isAdminAssistant: boolean;

  hasSelectedType: boolean;
}

const UserTypeContext = createContext<UserTypeContextType | undefined>(undefined);

export const UserTypeProvider = ({ children }: { children: ReactNode }) => {
  const [userType, setUserType] = useState<UserType>(() => {
    const saved = localStorage.getItem("user-type");
    if (
      saved === "driver" ||
      saved === "owner" ||
      saved === "admin" ||
      saved === "admin_assistant"
    ) {
      return saved;
    }
    return null;
  });

  useEffect(() => {
    if (userType) {
      localStorage.setItem("user-type", userType);
    } else {
      localStorage.removeItem("user-type");
    }
  }, [userType]);

  return (
    <UserTypeContext.Provider
      value={{
        userType,
        setUserType,
        isDriver: userType === "driver",
        isOwner: userType === "owner",
        isAdmin: userType === "admin",
        isAdminAssistant: userType === "admin_assistant",
        hasSelectedType: userType !== null,
      }}
    >
      {children}
    </UserTypeContext.Provider>
  );
};

const DEFAULT_USER_TYPE_CONTEXT: UserTypeContextType = {
  userType: null,
  setUserType: () => {},
  isDriver: false,
  isOwner: false,
  isAdmin: false,
  isAdminAssistant: false,
  hasSelectedType: false,
};

export const useUserType = () => {
  const context = useContext(UserTypeContext);
  return context ?? DEFAULT_USER_TYPE_CONTEXT;
};
