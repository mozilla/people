#include "nsXPCOM.h"
#include "nsIGenericFactory.h"

#include "NativeAddressBook.h"
#include "NativeAddressCard.h"
#include "nsMemory.h"
#include <string.h>
#include <stdio.h>

#include <AddressBook/ABAddressBookC.h>
#include <CoreFoundation/CFString.h>


NS_GENERIC_FACTORY_CONSTRUCTOR(NativeAddressBook)

// Standard nsModule registration block:
static const nsModuleComponentInfo components[] =
{
	{
		NATIVEADDRESSBOOK_CLASSNAME,
		INATIVEADDRESSBOOK_IID,
		NATIVEADDRESSBOOK_CONTRACTID,
		NativeAddressBookConstructor
	}
};
	
NS_IMPL_NSGETMODULE(ContactPoolExtension, components)


/* Implementation file */
NS_IMPL_ISUPPORTS1(NativeAddressBook, INativeAddressBook)

NativeAddressBook::NativeAddressBook()
{
  /* member initializers and constructor code */
}

NativeAddressBook::~NativeAddressBook()
{
  /* destructor code */
}


#define BUFSIZE 256

static const char *extractCFStringPtr(CFStringRef stringRef, char *buffer, unsigned int bufferSize)
{
	const char *ptr = CFStringGetCStringPtr(stringRef, kCFStringEncodingUTF16);
	if (ptr == NULL) {
			if (CFStringGetCString(stringRef, buffer, bufferSize, kCFStringEncodingUTF16)) ptr = buffer;
	}
	return ptr;
}

/* void getCards (out unsigned long count, [array, retval, size_is (count)] out INativeAddressCard cards); */
NS_IMETHODIMP NativeAddressBook::GetCards(PRUint32 *count NS_OUTPARAM, INativeAddressCard ***cards NS_OUTPARAM)
{
	ABAddressBookRef AB = ABGetSharedAddressBook();
	CFArrayRef peopleFound = ABCopyArrayOfAllPeople(AB);

	int i, j;
	*cards = (INativeAddressCard **) nsMemory::Alloc(sizeof(INativeAddressCard*) * CFArrayGetCount(peopleFound));
	*count = CFArrayGetCount(peopleFound);
	
	for (i=0;i<CFArrayGetCount(peopleFound);i++)
	{
		NativeAddressCard *card = new NativeAddressCard();
		(*cards)[i] = card;
		card->AddRef();

		ABPersonRef person = (ABPersonRef)CFArrayGetValueAtIndex(peopleFound, i);
		CFTypeRef firstName = ABRecordCopyValue (person, kABFirstNameProperty);
		CFTypeRef lastName = ABRecordCopyValue (person, kABLastNameProperty);
		//CFTypeRef firstNamePhonetic = ABRecordCopyValue (person, kABFirstNamePhoneticProperty);
		//CFTypeRef lastNamePhonetic = ABRecordCopyValue (person, kABLastNamePhoneticProperty);
		CFTypeRef org = ABRecordCopyValue (person, kABOrganizationProperty);
		CFTypeRef dept = ABRecordCopyValue (person, kABDepartmentProperty);
		CFTypeRef title = ABRecordCopyValue (person, kABJobTitleProperty);
    
		CFTypeRef emails = ABRecordCopyValue (person, kABEmailProperty);// kABMultiStringProperty
		CFTypeRef phones = ABRecordCopyValue (person, kABPhoneProperty);// kABMultiStringProperty
//	CFTypeRef addresses = ABRecordCopyValue (person, kABAddressProperty);// multi-dictionary
		CFTypeRef homePage = ABRecordCopyValue (person, kABHomePageProperty);// string - deprecated since 10.4
		CFTypeRef urls = ABRecordCopyValue (person, kABURLsProperty);// kABMultiStringProperty

		if (firstName) {
			card->setFirstName((CFStringRef)firstName);
		}

		if (lastName) {
			card->setLastName((CFStringRef)lastName);
		}

		if (org) {
			card->setOrganization((CFStringRef)org);
		}
		if (dept) {
			card->setDepartment((CFStringRef)dept);
		}	
    if (title) {
			card->setTitle((CFStringRef)title);
		}

		if (emails) {
			for (j=0;j<ABMultiValueCount((ABMultiValueRef)emails);j++) {
				CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)emails, j);
				CFStringRef email = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)emails, j);
				card->setEmail(label, email);
			}
		}

/*
		if (addresses) {
			for (j=0;j<ABMultiValueCount((ABMultiValueRef)addresses);j++) {
				CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)addresses, j);
				CFDictionaryRef anAddress = (CFDictionaryRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)addresses, j);
        
        CFStringRef aStreet = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressStreetKey);
        CFStringRef aCity = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressCityKey);
        CFStringRef aZip = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressZIPKey);
        CFStringRef aCountry = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressCountryKey);
        CFStringRef aCountryCode = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressCountryCodeKey);

        const char *labelPtr = deriveLabelFromString(label, labelBuffer, BUFSIZE);

				const char *streetPtr = aStreet ? extractCFStringPtr(aStreet, valueBuffer, BUFSIZE) : NULL;
				const char *cityPtr = aCity ? extractCFStringPtr(aCity, valueBuffer2, BUFSIZE) : NULL;
				const char *zipPtr = aZip ? extractCFStringPtr(aZip, valueBuffer3, BUFSIZE) : NULL;
				const char *countryPtr = aCountry ? extractCFStringPtr(aCountry, valueBuffer4, BUFSIZE) : NULL;
				const char *countryCodePtr = aCountryCode ? extractCFStringPtr(aCountryCode, valueBuffer5, BUFSIZE) : NULL;
				
				card->setAddress(labelPtr, streetPtr, cityPtr, zipPtr, countryPtr, countryCodePtr);
			}
		}
*/
		if (phones) {
			for (j=0;j<ABMultiValueCount((ABMultiValueRef)phones);j++) {
				CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)phones, j);
				CFStringRef phone = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)phones, j);
				card->setPhone(label, phone);
			}
		}

		if (homePage) {
			card->setURL(CFStringCreateWithCString(NULL, "homepage", kCFStringEncodingUTF16), (CFStringRef)homePage);
		}
		if (urls) {
			for (j=0;j<ABMultiValueCount((ABMultiValueRef)urls);j++) {
				CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)urls, j);
				CFStringRef url = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)urls, j);
				card->setURL(label, url);
			}
		}

	}

	return NS_OK;

}

/*

void GetList(nsIArray** aResult) {
nsIArray getProperty(in string name);
	  nsCOMPtr<nsIMutableArray> array = do_CreateInstance(NS_ARRAY_CONTRACTID);

  // append some elements
  ...

  // return it to the caller
  *aResult = array;
  NS_ADDREF(*aResult);
}
*/

