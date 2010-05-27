#include <stdlib.h>
#include <stdio.h>
#include <wchar.h>
#include "NativeAddressCard.h"
#include "nsMemory.h"
#include "nsStringAPI.h"
#include <AddressBook/ABAddressBookC.h>


/* Implementation file */
NS_IMPL_ISUPPORTS1(NativeAddressCard, INativeAddressCard)

void appendEscapingQuotes(CFMutableStringRef theString, const CFStringRef appendedString);


NativeAddressCard::NativeAddressCard() 
{
  /* member initializers and constructor code */
	mFirstName = NULL;
	mLastName = NULL;
	mOrganization = NULL;
	mDepartment = NULL;
	mTitle = NULL;
	mEmails = NULL;
  mGroupsJSON = NULL;
  mGroups = CFArrayCreateMutable (NULL, 0, NULL);

  
	mNumEmails = mEmailsSize = 0;
	mPhones = NULL;
	mNumPhones = mPhonesSize = 0;
	mURLs = NULL;
	mNumURLs = mURLsSize = 0;
  mAddresses = NULL;
	mNumAddresses = mAddressesSize = 0;
}

NativeAddressCard::~NativeAddressCard()
{
  /* destructor code */
	if (mFirstName) CFRelease(mFirstName);
	if (mLastName) CFRelease(mLastName);
	if (mOrganization) CFRelease(mOrganization);
	if (mTitle) CFRelease(mTitle);
	if (mGroupsJSON) CFRelease(mGroupsJSON);

	int i;
	if (mEmails) {
		for (i=0;i<mNumEmails;i++) {
      delete mEmails[i];
		}
		free(mEmails);
	}
	if (mPhones) {
		for (i=0;i<mNumPhones;i++) {
      delete mPhones[i];
		}
		free(mPhones);
	}
	if (mURLs) {
		for (i=0;i<mNumURLs;i++) {
      delete mURLs[i];
		}
		free(mURLs);
	}
}

/* string getProperty (in string name); */
NS_IMETHODIMP NativeAddressCard::GetProperty(const char *name, PRUnichar **_retval NS_OUTPARAM)
{
	CFStringRef val = NULL;
	if (!strcmp(name, "firstName")) {
		val = mFirstName;
	} else if (!strcmp(name, "lastName")) {
		val = mLastName;
	} else if (!strcmp(name, "organization")) {
		val = mOrganization;
	} else if (!strcmp(name, "department")) {
		val = mDepartment;
	} else if (!strcmp(name, "jobTitle")) {
		val = mTitle;
	} else if (!strcmp(name, "groups")) {
    if (mGroupsJSON == NULL) buildGroupJSON();
		val = mGroupsJSON;
	}
	
	if (val) {
    CFIndex length= CFStringGetLength(val);
    CFIndex bufferSize = sizeof(PRUnichar) * (length + 1);
    PRUnichar *buffer = (PRUnichar*)nsMemory::Alloc(bufferSize);
    if (buffer)  {
      CFStringGetCharacters (val, CFRangeMake(0, length), buffer);
      buffer[length] = '\0';
      *_retval = buffer;
      return NS_OK;
    }
    return NS_ERROR_OUT_OF_MEMORY;
	} else {
		// How do we return undefined?
		return NS_OK;
	}
}

// TODO: Replace this with a proper localization strategy.
static const wchar_t *deriveLabelFromString(CFStringRef stringRef)
{
	if (CFStringCompare(stringRef, kABWorkLabel, 0) == 0) {
		return L"work";
	} else if (CFStringCompare(stringRef, kABHomeLabel, 0) == 0) {
		return L"home";
	} else if (CFStringCompare(stringRef, kABOtherLabel, 0) == 0) {
		return L"other";
	} else if (CFStringCompare(stringRef, kABPhoneMobileLabel, 0) == 0) {
		return L"mobile";
	} else if (CFStringCompare(stringRef, kABPhoneHomeFAXLabel, 0) == 0) {
		return L"home fax";
	} else if (CFStringCompare(stringRef, kABPhoneWorkFAXLabel, 0) == 0) {
		return L"work fax";
	} else if (CFStringCompare(stringRef, kABPhonePagerLabel, 0) == 0) {
		return L"pager";
	} else if (CFStringCompare(stringRef, kABPhoneWorkLabel, 0) == 0) {
		return L"work";
	} else if (CFStringCompare(stringRef, kABPhoneHomeLabel, 0) == 0) {
		return L"home";
	} else if (CFStringCompare(stringRef, kABPhoneMainLabel, 0) == 0) {
		return L"main";
	} else if (CFStringCompare(stringRef, kABHomePageLabel, 0) == 0) {
		return L"home page";
	} else {
    return NULL;
	}
}

/* void getPropertyListLabels (in string name, out unsigned long count, [array, retval, size_is (count)] out string labels); */
NS_IMETHODIMP NativeAddressCard::GetPropertyListLabels(const char *name, PRUint32 *count NS_OUTPARAM, PRUnichar ***labels NS_OUTPARAM)
{
	TypedElement **array = NULL;
	int len;
	if (!strcmp(name, "email")) {
		array = (TypedElement**)mEmails;
		len = mNumEmails;
	}
	else if (!strcmp(name, "phone")) {
		array = (TypedElement**)mPhones;
		len = mNumPhones;
	}
	else if (!strcmp(name, "urls")) {
		array = (TypedElement**)mURLs;
		len = mNumURLs;
	}
  else if (!strcmp(name, "addresses")) {
		array = (TypedElement**)mAddresses;
		len = mNumAddresses;
	}
	
	if (array) {
		*count = len;
		*labels = (PRUnichar **) nsMemory::Alloc(sizeof(PRUnichar*) * len);
		if ( ! (*labels ) ) return NS_ERROR_OUT_OF_MEMORY;

		int i;
		for (i=0;i<len;i++) {
      CFStringRef type = array[i]->getType();
      if (type) {
        const wchar_t *labelLocal = deriveLabelFromString(array[i]->getType());
        if (labelLocal) {
          size_t len = wcslen(labelLocal);
          PRUnichar *buffer = (PRUnichar*)nsMemory::Alloc(sizeof(PRUnichar) * (len+1));
          if (buffer) {
            memcpy(buffer, labelLocal, sizeof(PRUnichar) * (len+1));
            (*labels)[i] = buffer;
          } else {
            return NS_ERROR_OUT_OF_MEMORY;
          }
        } else {
          CFIndex length= CFStringGetLength(array[i]->getType());
          CFIndex bufferSize = sizeof(PRUnichar) * (length + 1);
          PRUnichar *buffer = (PRUnichar*)nsMemory::Alloc(bufferSize);
          if (buffer) {
            CFStringGetCharacters (array[i]->getType(), CFRangeMake(0, length), buffer);
            buffer[length] = '\0';
            (*labels)[i] = buffer;
          } else {
            return NS_ERROR_OUT_OF_MEMORY;
          }
        }
      } else {
        PRUnichar *buffer = (PRUnichar*)nsMemory::Alloc(1);
        if (buffer) {
          buffer[0] = '\0';
          (*labels)[i] = buffer;
        } else {
          return NS_ERROR_OUT_OF_MEMORY;
        }
      }
		}
    return NS_OK;
	} else {
		*count = 0;

		// How do we return undefined?
		return NS_OK;
	}
}

/* void getPropertyListValues (in string name, out unsigned long count, [array, retval, size_is (count)] out string values); */
NS_IMETHODIMP NativeAddressCard::GetPropertyListValues(const char *name, PRUint32 *count NS_OUTPARAM, PRUnichar ***values NS_OUTPARAM)
{
	TypedElement **array = NULL;
	int len;
	if (!strcmp(name, "email")) {
		array = (TypedElement**)mEmails;
		len = mNumEmails;
	}
	else if (!strcmp(name, "phone")) {
		array = (TypedElement**)mPhones;
		len = mNumPhones;
	}
	else if (!strcmp(name, "urls")) {
		array = (TypedElement**)mURLs;
		len = mNumURLs;
	}
  else if (!strcmp(name, "addresses")) {
		array = (TypedElement**)mAddresses;
		len = mNumAddresses;
	}
	
	if (array) {
		*count = len;
		*values = (PRUnichar **) nsMemory::Alloc(sizeof(PRUnichar*) * len);
		if ( ! (*values ) ) return NS_ERROR_OUT_OF_MEMORY;

		int i;
		for (i=0;i<len;i++) {
      CFStringRef value = array[i]->getValue();
      PRUnichar *buffer;
      if (value) {
        CFIndex length= CFStringGetLength(array[i]->getValue());
        CFIndex bufferSize = sizeof(PRUnichar) * (length + 1);
        buffer = (PRUnichar*)nsMemory::Alloc(bufferSize);
        if (buffer) {
          CFStringGetCharacters (array[i]->getValue(), CFRangeMake(0, length), buffer);
          buffer[length] = '\0';
        }
      } else {
        buffer = (PRUnichar*)nsMemory::Alloc(1);      
        if (buffer) buffer[0] = '\0';
      }
      if (!buffer) {
        return NS_ERROR_OUT_OF_MEMORY;
      }
      (*values)[i] = buffer;
		}
    return NS_OK;
	} else {
		*count = 0;
		// How do we return undefined?
		return NS_OK;
	}
}


void NativeAddressCard::setFirstName(const CFStringRef name)
{
	mFirstName = name;
}
void NativeAddressCard::setLastName(const CFStringRef name)
{
	mLastName = name;
}
void NativeAddressCard::setOrganization(const CFStringRef org)
{
	mOrganization = org;
}
void NativeAddressCard::setDepartment(const CFStringRef org)
{
	mDepartment = org;
}
void NativeAddressCard::setTitle(const CFStringRef title)
{
  mTitle = title;
}

void NativeAddressCard::buildGroupJSON()
{
  mGroupsJSON = CFStringCreateMutable(NULL, 0);
  int i;
  
  CFStringAppend(mGroupsJSON, CFSTR("["));
  for (i=0;i<CFArrayGetCount(mGroups);i++)
  {
    if (i>0) CFStringAppend(mGroupsJSON, CFSTR(","));

    CFStringRef group = (CFStringRef)CFArrayGetValueAtIndex(mGroups, i);
  
    CFStringAppend(mGroupsJSON, CFSTR("\""));
    appendEscapingQuotes(mGroupsJSON, group);
    CFStringAppend(mGroupsJSON, CFSTR("\""));  
  }
  CFStringAppend(mGroupsJSON, CFSTR("]"));
}

void NativeAddressCard::addGroup(const CFStringRef groupName)
{
  CFArrayAppendValue(mGroups, groupName);
}


void NativeAddressCard::setEmail(const CFStringRef type, const CFStringRef email)
{
	if (mNumEmails == mEmailsSize) {
			mEmails = (TaggedField**)realloc(mEmails, sizeof(TaggedField*) * (mEmailsSize + 8));
			mEmailsSize += 8;
	}
	mEmails[mNumEmails++] = new TaggedField(type, email);
}
void NativeAddressCard::setPhone(const CFStringRef type, const CFStringRef phone)
{
	if (mNumPhones == mPhonesSize) {
			mPhones = (TaggedField**)realloc(mPhones, sizeof(TaggedField*) * (mPhonesSize + 8));
			mPhonesSize += 8;
	}
	mPhones[mNumPhones++] = new TaggedField(type, phone);
}
void NativeAddressCard::setURL(const CFStringRef type, const CFStringRef url)
{
	if (mNumURLs == mURLsSize) {
			mURLs = (TaggedField**)realloc(mURLs, sizeof(TaggedField*) * (mURLsSize + 8));
			mURLsSize += 8;
	}
	mURLs[mNumURLs++] = new TaggedField(type, url);
}

TaggedField::TaggedField(const CFStringRef type, const CFStringRef value) : mType(NULL), mValue(NULL)
{
	if (type) mType = type;
	if (value) mValue = value;
}
TaggedField::~TaggedField()
{
  CFRelease(mType);
  CFRelease(mValue);
}

CFStringRef TaggedField::getType()
{
  return mType;
}

CFStringRef TaggedField::getValue()
{
  return mValue;
}


void NativeAddressCard::setAddress(const CFStringRef type, const CFStringRef streetPtr, const CFStringRef cityPtr, 
                                    const CFStringRef statePtr, const CFStringRef zipPtr, const CFStringRef countryPtr, const CFStringRef countryCodePtr)
{
	if (mNumAddresses == mAddressesSize) {
			mAddresses = (AddressField**)realloc(mAddresses, sizeof(AddressField*) * (mAddressesSize + 8));
			mAddressesSize += 8;
	}
	mAddresses[mNumAddresses++] = new AddressField(type, streetPtr, cityPtr, statePtr, zipPtr, countryPtr, countryCodePtr);
}

AddressField::AddressField(const CFStringRef type, const CFStringRef street, const CFStringRef city, 
                          const CFStringRef state, const CFStringRef zip, 
                           const CFStringRef country, const CFStringRef countryCode) : 
                           mType(NULL), mStreet(NULL), mCity(NULL), mState(NULL), mZip(NULL), mCountry(NULL), mCountryCode(NULL)
{
	if (type) mType = type;
	if (street) mStreet = street;
	if (city) mCity = city;
	if (state) mState = state;
	if (zip) mZip = zip;
	if (country) mCountry = country;
	if (countryCode) mCountryCode = countryCode;
  mLocalJSON = NULL;
}

CFStringRef AddressField::getType()
{
  return mType;
}

CFStringRef AddressField::getValue()
{
  if (mLocalJSON == NULL) {
    int first = 1;
    mLocalJSON = CFStringCreateMutable(NULL, 0);
    CFStringAppend(mLocalJSON, CFSTR("{"));
    if (mStreet) {
      CFStringAppend(mLocalJSON, CFSTR("\"streetAddress\":\""));
      appendEscapingQuotes(mLocalJSON, mStreet);
      CFStringAppend(mLocalJSON, CFSTR("\""));
      first = 0;
    }
    if (mCity) {
      if (!first) CFStringAppend(mLocalJSON, CFSTR(","));
      CFStringAppend(mLocalJSON, CFSTR("\"locality\":\""));
      appendEscapingQuotes(mLocalJSON, mCity);
      CFStringAppend(mLocalJSON, CFSTR("\""));
      first = 0;
    }
    if (mState) {
      if (!first) CFStringAppend(mLocalJSON, CFSTR(","));
      CFStringAppend(mLocalJSON, CFSTR("\"region\":\""));
      appendEscapingQuotes(mLocalJSON, mState);
      CFStringAppend(mLocalJSON, CFSTR("\""));
      first = 0;
    }
    if (mZip) {
      if (!first) CFStringAppend(mLocalJSON, CFSTR(","));
      CFStringAppend(mLocalJSON, CFSTR("\"postalCode\":\""));
      appendEscapingQuotes(mLocalJSON, mZip);
      CFStringAppend(mLocalJSON, CFSTR("\""));
      first = 0;
    }
    if (mCountry) {
      if (!first) CFStringAppend(mLocalJSON, CFSTR(","));
      CFStringAppend(mLocalJSON, CFSTR("\"country\":\""));
      appendEscapingQuotes(mLocalJSON, mCountry);
      CFStringAppend(mLocalJSON, CFSTR("\""));
      first = 0;
    }
    CFStringAppend(mLocalJSON, CFSTR("}"));
  }
  
  return mLocalJSON;
}


void appendEscapingQuotes(CFMutableStringRef theString, const CFStringRef appendedString)
{
  // There is certainly a more efficient way to do this.
  CFMutableStringRef temp = CFStringCreateMutableCopy(NULL, 0, appendedString);
  CFStringFindAndReplace(temp, CFSTR("\""), CFSTR("\\\""), CFRangeMake(0, CFStringGetLength(appendedString)), 0);
  CFStringAppend(theString, temp);
  CFRelease(temp);
}