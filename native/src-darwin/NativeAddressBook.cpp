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
	const char *ptr = CFStringGetCStringPtr(stringRef, kCFStringEncodingUTF8);
	if (ptr == NULL) {
			if (CFStringGetCString(stringRef, buffer, bufferSize, kCFStringEncodingUTF8)) ptr = buffer;
	}
	return ptr;
}

// TODO: Replace this with a proper localization strategy.
static const char *deriveLabelFromString(CFStringRef stringRef, char *buffer, unsigned int bufferSize)
{
	if (CFStringCompare(stringRef, kABWorkLabel, 0) == 0) {
		return "work";
	} else if (CFStringCompare(stringRef, kABHomeLabel, 0) == 0) {
		return "home";
	} else if (CFStringCompare(stringRef, kABOtherLabel, 0) == 0) {
		return "other";
	} else if (CFStringCompare(stringRef, kABPhoneMobileLabel, 0) == 0) {
		return "mobile";
	} else if (CFStringCompare(stringRef, kABPhoneHomeFAXLabel, 0) == 0) {
		return "home fax";
	} else if (CFStringCompare(stringRef, kABPhoneWorkFAXLabel, 0) == 0) {
		return "work fax";
	} else if (CFStringCompare(stringRef, kABPhonePagerLabel, 0) == 0) {
		return "pager";
	} else if (CFStringCompare(stringRef, kABPhoneWorkLabel, 0) == 0) {
		return "work";
	} else if (CFStringCompare(stringRef, kABPhoneHomeLabel, 0) == 0) {
		return "home";
	} else if (CFStringCompare(stringRef, kABPhoneMainLabel, 0) == 0) {
		return "main";
	} else {
		return extractCFStringPtr(stringRef, buffer, bufferSize);
	}
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
		CFTypeRef emails = ABRecordCopyValue (person, kABEmailProperty);// kABMultiStringProperty
		CFTypeRef phones = ABRecordCopyValue (person, kABPhoneProperty);// kABMultiStringProperty

		CFTypeRef homePage = ABRecordCopyValue (person, kABHomePageProperty);// string - deprecated since 10.4
		CFTypeRef urls = ABRecordCopyValue (person, kABURLsProperty);// kABMultiStringProperty

		char valueBuffer[BUFSIZE]; // used when CFStringGetCStringPtr fails
		char labelBuffer[BUFSIZE]; // used when CFStringGetCStringPtr fails

		if (firstName) {
			card->setFirstName(extractCFStringPtr((CFStringRef)firstName, valueBuffer, BUFSIZE));
		}

		if (lastName) {
			card->setLastName(extractCFStringPtr((CFStringRef)lastName, valueBuffer, BUFSIZE));
		}

		if (emails) {
			for (j=0;j<ABMultiValueCount((ABMultiValueRef)emails);j++) {
				CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)emails, j);
				CFStringRef email = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)emails, j);

				const char *labelPtr = deriveLabelFromString(label, labelBuffer, BUFSIZE);
				const char *valuePtr = extractCFStringPtr(email, valueBuffer, BUFSIZE);
				
				card->setEmail(labelPtr, valuePtr);
			}
		}

		if (phones) {
			for (j=0;j<ABMultiValueCount((ABMultiValueRef)phones);j++) {
				CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)phones, j);
				CFStringRef phone = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)phones, j);

				const char *labelPtr = deriveLabelFromString(label, labelBuffer, BUFSIZE);
				const char *valuePtr = extractCFStringPtr(phone, valueBuffer, BUFSIZE);
				card->setPhone(labelPtr, valuePtr);
			}
		}

		if (homePage) {
			card->setURL("homepage", extractCFStringPtr((CFStringRef)firstName, valueBuffer, BUFSIZE));		
		}
		if (urls) {
			for (j=0;j<ABMultiValueCount((ABMultiValueRef)urls);j++) {
				CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)urls, j);
				CFStringRef url = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)urls, j);

				const char *labelPtr = deriveLabelFromString(label, labelBuffer, BUFSIZE);
				const char *valuePtr = extractCFStringPtr(url, valueBuffer, BUFSIZE);
				card->setURL(labelPtr, valuePtr);
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

